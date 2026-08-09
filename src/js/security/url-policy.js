// Link policy shared by the preview, the sanitizer, and the internal-link
// opener. Pure string logic so it can be tested exhaustively without a DOM.
//
// Rust performs the authoritative filesystem resolution. This module is the
// first, cheap rejection layer and decides how a click is routed.

export const MARKDOWN_EXTENSIONS = Object.freeze(['md', 'markdown', 'mdown', 'mkd']);

export const LINK_KIND = Object.freeze({
  external: 'external',
  fragment: 'fragment',
  internal: 'internal',
  blocked: 'blocked',
});

const EXTERNAL_SCHEMES = Object.freeze(['http:', 'https:', 'mailto:']);
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const WINDOWS_DRIVE = /^[a-z]:/i;
const ENCODED_TRAVERSAL = /%2e%2e/i;
const ENCODED_SEPARATOR = /%2f|%5c/i;

function decodeSegment(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

/** Split `path#fragment` without letting a fragment smuggle path characters. */
export function splitFragment(href) {
  const index = href.indexOf('#');
  if (index < 0) return { path: href, fragment: '' };
  return { path: href.slice(0, index), fragment: href.slice(index + 1) };
}

export function hasMarkdownExtension(pathValue) {
  const name = pathValue.split('/').pop() || '';
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return false;
  return MARKDOWN_EXTENSIONS.includes(name.slice(dot + 1).toLowerCase());
}

/**
 * Reject anything that is not a plain relative path inside the document
 * folder before it ever reaches the native layer.
 */
export function isSafeRelativeMarkdownPath(pathValue) {
  if (typeof pathValue !== 'string' || pathValue.length === 0 || pathValue.length > 1024) return false;
  if (CONTROL_CHARACTERS.test(pathValue)) return false;
  if (pathValue.includes('\\')) return false;
  if (pathValue.includes('?')) return false;
  if (pathValue.startsWith('/') || pathValue.startsWith('//')) return false;
  if (WINDOWS_DRIVE.test(pathValue)) return false;
  if (SCHEME_PATTERN.test(pathValue)) return false;
  if (ENCODED_TRAVERSAL.test(pathValue) || ENCODED_SEPARATOR.test(pathValue)) return false;
  if (pathValue.endsWith('/')) return false;

  const segments = pathValue.split('/');
  for (const segment of segments) {
    if (segment === '' || segment === '.' || segment === '..') return false;
    const decoded = decodeSegment(segment);
    if (decoded === null) return false;
    if (decoded === '.' || decoded === '..') return false;
    if (decoded.includes('/') || decoded.includes('\\') || CONTROL_CHARACTERS.test(decoded)) return false;
  }

  return hasMarkdownExtension(decodeSegment(segments[segments.length - 1]) ?? '');
}

/** Only http(s) and mailto may be handed to the operating system. */
export function isAllowedExternalUrl(href) {
  if (typeof href !== 'string' || href.length === 0 || href.length > 4096) return false;
  if (CONTROL_CHARACTERS.test(href)) return false;
  let url;
  try {
    url = new URL(href);
  } catch {
    return false;
  }
  if (!EXTERNAL_SCHEMES.includes(url.protocol)) return false;
  return url.href.toLowerCase().startsWith(url.protocol);
}

/** Decide how a preview link click must be handled. */
export function classifyLink(href) {
  if (typeof href !== 'string' || href.length === 0) {
    return { kind: LINK_KIND.blocked, reason: 'empty' };
  }
  if (CONTROL_CHARACTERS.test(href)) {
    return { kind: LINK_KIND.blocked, reason: 'control-characters' };
  }
  if (href.startsWith('#')) {
    return { kind: LINK_KIND.fragment, fragment: href.slice(1) };
  }
  if (SCHEME_PATTERN.test(href)) {
    return isAllowedExternalUrl(href)
      ? { kind: LINK_KIND.external, href }
      : { kind: LINK_KIND.blocked, reason: 'unsupported-scheme' };
  }

  const { path, fragment } = splitFragment(href);
  if (isSafeRelativeMarkdownPath(path)) {
    return { kind: LINK_KIND.internal, path, fragment };
  }
  return { kind: LINK_KIND.blocked, reason: 'unsupported-relative-target' };
}

const IMAGE_EXTENSIONS = Object.freeze(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'avif']);

/**
 * Local images are resolved natively. SVG is deliberately excluded because an
 * SVG document can carry script and would bypass the Markdown sanitizer.
 */
export function isSupportedLocalImagePath(pathValue) {
  if (typeof pathValue !== 'string' || pathValue.length === 0 || pathValue.length > 1024) return false;
  if (CONTROL_CHARACTERS.test(pathValue)) return false;
  if (pathValue.includes('\\') || pathValue.includes('?') || pathValue.includes('#')) return false;
  if (pathValue.startsWith('/') || WINDOWS_DRIVE.test(pathValue) || SCHEME_PATTERN.test(pathValue)) return false;
  if (ENCODED_TRAVERSAL.test(pathValue) || ENCODED_SEPARATOR.test(pathValue)) return false;

  const segments = pathValue.split('/');
  for (const segment of segments) {
    if (segment === '' || segment === '.' || segment === '..') return false;
    const decoded = decodeSegment(segment);
    if (decoded === null || decoded === '.' || decoded === '..') return false;
    if (decoded.includes('/') || decoded.includes('\\')) return false;
  }

  const name = decodeSegment(segments[segments.length - 1]) ?? '';
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return false;
  return IMAGE_EXTENSIONS.includes(name.slice(dot + 1).toLowerCase());
}

export function classifyImageSource(source) {
  if (typeof source !== 'string' || source.length === 0) {
    return { kind: LINK_KIND.blocked, reason: 'empty' };
  }
  if (SCHEME_PATTERN.test(source)) {
    // The application is offline by policy; remote images are never fetched.
    return { kind: LINK_KIND.blocked, reason: 'remote-image' };
  }
  if (isSupportedLocalImagePath(source)) {
    return { kind: LINK_KIND.internal, path: source };
  }
  return { kind: LINK_KIND.blocked, reason: 'unsupported-image-target' };
}
