// The single sanitization boundary for everything that reaches the preview DOM.
//
// Two strictly separate policies are used:
//   * Markdown HTML — a narrow allowlist for marked() output.
//   * Diagram SVG   — an SVG-only profile for Full-edition Mermaid output.
//
// The Markdown policy never gains SVG capabilities, and diagram SVG never
// passes through the Markdown policy.

import createDOMPurify from 'dompurify';

const MARKDOWN_TAGS = Object.freeze([
  'a', 'abbr', 'b', 'blockquote', 'br', 'caption', 'code', 'col', 'colgroup', 'dd', 'del',
  'details', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5',
  'h6', 'hr', 'i', 'img', 'input', 'ins', 'kbd', 'li', 'mark', 'ol', 'p', 'pre', 'q', 's',
  'samp', 'section', 'small', 'span', 'strong', 'sub', 'summary', 'sup', 'table', 'tbody',
  'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul', 'var', 'wbr',
]);

const MARKDOWN_ATTRIBUTES = Object.freeze([
  'align', 'alt', 'checked', 'class', 'colspan', 'data-footnote-ref', 'data-footnotes',
  'data-footnote-backref', 'dir', 'disabled', 'href', 'id', 'lang', 'name', 'open',
  'role', 'rowspan', 'scope', 'src', 'start', 'title', 'type', 'value',
]);

const MARKDOWN_FORBIDDEN_TAGS = Object.freeze([
  'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'base',
  'meta', 'link', 'form', 'button', 'select', 'option', 'textarea', 'audio', 'video',
  'source', 'track', 'canvas', 'template', 'slot', 'noscript', 'svg', 'math', 'portal',
]);

const MARKDOWN_FORBIDDEN_ATTRIBUTES = Object.freeze([
  'style', 'srcset', 'sizes', 'loading', 'target', 'ping', 'formaction', 'form',
  'download', 'is', 'rel', 'referrerpolicy', 'usemap', 'background', 'poster',
]);

// Relative paths and fragments are allowed; the only absolute schemes accepted
// are http(s) and mailto. Everything else, including javascript: and data:,
// is removed.
const ALLOWED_URI = /^(?:(?:https?|mailto):|[^:]+$)/i;

// Diagram SVG may reference same-document ids (markers, gradients, clip paths)
// but never an absolute URL.
const ALLOWED_SVG_URI = /^(?:[^a-z+.-]|[a-z+.-]+(?:[^a-z+.-:]|$))/i;

const SVG_FORBIDDEN_TAGS = Object.freeze([
  'script', 'foreignObject', 'a', 'use', 'image', 'iframe', 'embed', 'object', 'audio',
  'video', 'animate', 'animateMotion', 'animateTransform', 'set', 'handler', 'listener',
  'discard', 'cursor', 'font-face-uri', 'filter', 'feImage',
]);

const SVG_FORBIDDEN_ATTRIBUTES = Object.freeze([
  'href', 'xlink:href', 'xlink:show', 'xlink:actuate', 'externalResourcesRequired',
  'requiredExtensions', 'systemLanguage', 'target', 'ping', 'contentScriptType',
]);

const UNSAFE_CSS = /(?:url\s*\(|@import|expression\s*\(|javascript\s*:|behavior\s*:|-moz-binding)/i;

let purifier = null;

function purify() {
  if (!purifier) {
    purifier = createDOMPurify(globalThis.window);
    if (!purifier.isSupported) {
      throw new Error('DOMPurify is unavailable; refusing to render untrusted Markdown.');
    }
  }
  return purifier;
}

/** Test seam: rebuild the purifier against another window (jsdom). */
export function resetSanitizerForTesting(windowLike) {
  purifier = windowLike ? createDOMPurify(windowLike) : null;
  return purifier;
}

function stripUnsafeCss(root) {
  const doc = root.ownerDocument || globalThis.document;
  const walker = doc.createTreeWalker(root, 0x1 /* SHOW_ELEMENT */);
  const elements = [];
  let current = walker.currentNode?.nodeType === 1 ? walker.currentNode : walker.nextNode();
  while (current) {
    elements.push(current);
    current = walker.nextNode();
  }

  for (const element of elements) {
    const tag = element.tagName?.toLowerCase();
    if (tag === 'style') {
      if (UNSAFE_CSS.test(element.textContent || '')) element.remove();
      continue;
    }
    const style = element.getAttribute?.('style');
    if (style && UNSAFE_CSS.test(style)) element.removeAttribute('style');
  }
  return root;
}

function cleanMarkdownUris(root) {
  const controlCharacters = /[\u0000-\u001f\u007f]/;
  const scheme = /^[a-z][a-z0-9+.-]*:/i;

  for (const link of root.querySelectorAll('a[href]')) {
    const href = (link.getAttribute('href') || '').trim();
    const allowedScheme = /^(?:https?|mailto):/i.test(href);
    const allowedRelative = !scheme.test(href) && !href.startsWith('//');
    if (!href || controlCharacters.test(href) || (!allowedScheme && !allowedRelative)) {
      link.removeAttribute('href');
    }
  }

  for (const image of root.querySelectorAll('img[src]')) {
    const source = (image.getAttribute('src') || '').trim();
    const allowedRemote = /^https?:/i.test(source);
    const allowedRelative = !scheme.test(source) && !source.startsWith('//');
    if (!source || controlCharacters.test(source) || (!allowedRemote && !allowedRelative)) {
      image.removeAttribute('src');
    }
  }
  return root;
}

/**
 * Sanitize marked() output and return a fragment. Callers insert the fragment;
 * no code path in the application assigns untrusted HTML to innerHTML.
 */
export function sanitizeMarkdownFragment(html) {
  const fragment = purify().sanitize(String(html), {
    ALLOWED_TAGS: [...MARKDOWN_TAGS],
    ALLOWED_ATTR: [...MARKDOWN_ATTRIBUTES],
    FORBID_TAGS: [...MARKDOWN_FORBIDDEN_TAGS],
    FORBID_ATTR: [...MARKDOWN_FORBIDDEN_ATTRIBUTES],
    ALLOWED_URI_REGEXP: ALLOWED_URI,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: true,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    ALLOW_SELF_CLOSE_IN_ATTR: false,
    SAFE_FOR_TEMPLATES: false,
    RETURN_DOM_FRAGMENT: true,
  });
  return cleanMarkdownUris(fragment);
}

// Highlighters emit their own markup. It is never trusted: only <span> with a
// bounded number of simple class names survives, so a highlighter bug or a
// crafted language definition cannot introduce active content.
const HIGHLIGHT_CLASS = /^[a-z][a-z0-9-]*$/i;
const MAX_HIGHLIGHT_CLASSES = 6;

export function sanitizeHighlightedCodeFragment(html) {
  const fragment = purify().sanitize(String(html), {
    ALLOWED_TAGS: ['span'],
    ALLOWED_ATTR: ['class'],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    KEEP_CONTENT: true,
    RETURN_DOM_FRAGMENT: true,
  });

  for (const span of fragment.querySelectorAll('span')) {
    const classes = (span.getAttribute('class') || '')
      .split(/\s+/)
      .filter((name) => HIGHLIGHT_CLASS.test(name))
      .slice(0, MAX_HIGHLIGHT_CLASSES);
    if (classes.length === 0) span.removeAttribute('class');
    else span.setAttribute('class', classes.join(' '));
  }

  return fragment;
}

/** String form of the Markdown policy, used by tests and assertions. */
export function sanitizeMarkdownHtml(html) {
  const fragment = sanitizeMarkdownFragment(html);
  const container = (fragment.ownerDocument || globalThis.document).createElement('div');
  container.appendChild(fragment);
  return container.innerHTML;
}

/**
 * Sanitize a generated diagram SVG with a separate SVG-only policy and return
 * the root <svg> element, or null when nothing renderable survived.
 */
export function sanitizeDiagramSvg(svgMarkup) {
  const fragment = purify().sanitize(String(svgMarkup), {
    USE_PROFILES: { svg: true, svgFilters: false },
    FORBID_TAGS: [...SVG_FORBIDDEN_TAGS],
    FORBID_ATTR: [...SVG_FORBIDDEN_ATTRIBUTES],
    ALLOWED_URI_REGEXP: ALLOWED_SVG_URI,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: true,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    RETURN_DOM_FRAGMENT: true,
  });

  stripUnsafeCss(fragment);

  const svg = fragment.querySelector('svg');
  if (!svg) return null;
  svg.removeAttribute('onload');
  return svg;
}

export const SANITIZER_POLICY = Object.freeze({
  markdownTags: MARKDOWN_TAGS,
  markdownAttributes: MARKDOWN_ATTRIBUTES,
  forbiddenMarkdownTags: MARKDOWN_FORBIDDEN_TAGS,
  forbiddenSvgTags: SVG_FORBIDDEN_TAGS,
});
