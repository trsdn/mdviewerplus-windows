// Hardened Markdown render pipeline.
//
// Every render runs the same generation-aware sequence:
//   1. split frontmatter (Full only parses it)
//   2. parse Markdown
//   3. sanitize the HTML with the Markdown policy
//   4. insert the sanitized fragment
//   5. run trusted postprocessors on the inserted DOM
//   6. start cancellable asynchronous work (images, highlighting, diagrams)
//
// Nothing in this file assigns untrusted HTML to innerHTML.

import { marked } from 'marked';
import markedFootnote from 'marked-footnote';

import {
  CAPABILITIES,
  loadDiagramRenderer,
  loadFrontmatterRenderer,
  loadPreviewHighlighter,
} from '#edition';
import { sanitizeMarkdownFragment } from '../security/sanitizer.js';
import { classifyLink, LINK_KIND } from '../security/url-policy.js';
import { copyText } from '../platform/clipboard.js';
import { decorateAlerts } from './alerts.js';
import { attachCodeBlockControls, decorateCodeBlocks, getBlockSource } from './code-blocks.js';
import { decorateFootnotes } from './footnotes.js';
import { decorateHeadings, extractSourceHeadings } from './headings.js';
import { decorateImages, resolveImages } from './images.js';
import { splitFrontmatter } from './frontmatter.js';
import { decorateTaskLists } from './task-lists.js';

const RENDER_DEBOUNCE_MS = 60;
const HIGHLIGHT_BATCH = 8;

let previewElement = null;
let generation = 0;
let renderTimer = null;
let pendingSource = null;
let lastSource = '';
let headings = [];
let objectUrls = [];
let asyncWork = new Set();
let highlighterPromise = null;
let diagramRendererPromise = null;
let frontmatterRendererPromise = null;
let removeCodeBlockControls = null;
let hooks = {
  openInternalLink: async () => false,
  openExternalUrl: async () => false,
  loadImage: async () => null,
  onOutlineChange: () => undefined,
  onImageActivate: () => undefined,
  onAfterRender: () => undefined,
};

export function initPreview(providedHooks = {}) {
  previewElement = document.getElementById('preview-content');
  hooks = { ...hooks, ...providedHooks };

  marked.setOptions({ gfm: true, breaks: true });
  marked.use(markedFootnote({ description: 'Footnotes' }));

  removeCodeBlockControls = attachCodeBlockControls(previewElement, { copyText });
  previewElement.addEventListener('click', handlePreviewClick);
  previewElement.addEventListener('keydown', handlePreviewKeydown);

  return previewElement;
}

function releaseObjectUrls() {
  for (const url of objectUrls) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // A revoked or foreign URL is not an error worth surfacing.
    }
  }
  objectUrls = [];
}

function track(promise) {
  const work = asyncWork;
  work.add(promise);
  promise.finally(() => work.delete(promise));
  return promise;
}

/** Immediate render, used for document loads and explicit refreshes. */
export function renderMarkdown(markdown) {
  if (!previewElement) return null;
  if (renderTimer !== null) {
    clearTimeout(renderTimer);
    renderTimer = null;
    pendingSource = null;
  }
  return render(String(markdown ?? ''));
}

/** Debounced render, used while typing so the editor stays responsive. */
export function scheduleRender(markdown) {
  pendingSource = String(markdown ?? '');
  if (renderTimer !== null) return;
  renderTimer = setTimeout(() => {
    renderTimer = null;
    const source = pendingSource;
    pendingSource = null;
    if (source !== null) render(source);
  }, RENDER_DEBOUNCE_MS);
}

function render(markdown) {
  const currentGeneration = ++generation;
  const isCurrent = () => currentGeneration === generation;
  lastSource = markdown;
  releaseObjectUrls();
  asyncWork = new Set();

  const { frontmatter, body, error: frontmatterError } = CAPABILITIES.frontmatterCards
    ? splitFrontmatter(markdown)
    : { frontmatter: null, body: markdown, error: null };

  const tokens = marked.lexer(body);
  const sourceBlocks = [];
  marked.walkTokens(tokens, (token) => {
    if (token.type === 'code') {
      sourceBlocks.push({ source: token.text || '', language: token.lang || '' });
    }
  });
  const html = marked.parser(tokens);
  const fragment = sanitizeMarkdownFragment(html);

  headings = decorateHeadings(fragment, extractSourceHeadings(body));
  decorateAlerts(fragment);
  decorateTaskLists(fragment);
  decorateFootnotes(fragment);
  const { blocks, diagrams } = decorateCodeBlocks(fragment, {
    diagramsEnabled: CAPABILITIES.diagrams,
    sourceBlocks,
  });
  const pendingImages = decorateImages(fragment);

  previewElement.replaceChildren(fragment);
  hooks.onOutlineChange(headings);
  hooks.onAfterRender();

  if (pendingImages.length > 0) {
    track(
      resolveImages(pendingImages, { loadImage: hooks.loadImage, isCurrent })
        .then((urls) => {
          if (isCurrent()) objectUrls.push(...urls);
          else for (const url of urls) URL.revokeObjectURL(url);
        })
        .catch(() => undefined),
    );
  }

  if (blocks.length > 0) {
    track(highlightBlocks(blocks, isCurrent).catch(() => undefined));
  }

  if (frontmatter !== null) {
    track(renderFrontmatterCard(frontmatter, frontmatterError, isCurrent).catch(() => undefined));
  }

  if (diagrams.length > 0) {
    track(renderDiagrams(diagrams, isCurrent).catch(() => undefined));
  }

  return { generation: currentGeneration, headings, blocks: blocks.length, diagrams: diagrams.length };
}

async function highlightBlocks(blocks, isCurrent, { force = false } = {}) {
  if (!highlighterPromise) highlighterPromise = loadPreviewHighlighter();
  const highlighter = await highlighterPromise;
  if (!highlighter || !isCurrent()) return;

  for (let index = 0; index < blocks.length; index += 1) {
    if (!isCurrent()) return;
    const { code, language, source } = blocks[index];
    const highlighted = highlighter.highlight(source, language);
    if (highlighted) {
      code.replaceChildren(highlighted.fragment);
      code.classList.add('is-highlighted');
      if (highlighted.language) code.setAttribute('data-highlight-language', highlighted.language);
    }
    if (!force && index % HIGHLIGHT_BATCH === HIGHLIGHT_BATCH - 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
}

async function renderFrontmatterCard(frontmatter, detectionError, isCurrent) {
  if (!frontmatterRendererPromise) frontmatterRendererPromise = loadFrontmatterRenderer();
  const renderer = await frontmatterRendererPromise;
  if (!renderer || !isCurrent()) return;

  const card = renderer.render(frontmatter, previewElement.ownerDocument, { detectionError });
  if (!card || !isCurrent()) return;
  previewElement.insertBefore(card, previewElement.firstChild);
}

async function renderDiagrams(containers, isCurrent, options = {}) {
  if (!diagramRendererPromise) diagramRendererPromise = loadDiagramRenderer();
  const renderer = await diagramRendererPromise;
  if (!renderer || !isCurrent()) return;
  await renderer.render(containers, { isCurrent, getSource: getBlockSource, ...options });
}

function handlePreviewClick(event) {
  const image = event.target.closest?.('img.preview-image[data-image-state="loaded"]');
  if (image) {
    event.preventDefault();
    hooks.onImageActivate(image);
    return;
  }

  const link = event.target.closest?.('a');
  if (!link || !previewElement.contains(link)) return;

  event.preventDefault();
  activateLink(link);
}

function handlePreviewKeydown(event) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const image = event.target.closest?.('img.preview-image[data-image-state="loaded"]');
  if (!image) return;
  event.preventDefault();
  hooks.onImageActivate(image);
}

function activateLink(link) {
  const classified = classifyLink(link.getAttribute('href') || '');

  if (classified.kind === LINK_KIND.fragment) {
    scrollToFragment(classified.fragment);
    return;
  }
  if (classified.kind === LINK_KIND.external) {
    hooks.openExternalUrl(classified.href);
    return;
  }
  if (classified.kind === LINK_KIND.internal) {
    hooks.openInternalLink(classified);
  }
}

export function scrollToFragment(fragment) {
  if (!previewElement || !fragment) return false;
  let decoded = fragment;
  try {
    decoded = decodeURIComponent(fragment);
  } catch {
    // Keep the raw fragment when it is not valid percent-encoding.
  }
  const target = findElementById(decoded) || findElementById(fragment);
  if (!target) return false;
  target.scrollIntoView({ block: 'start', behavior: 'auto' });
  if (typeof target.focus === 'function') target.focus({ preventScroll: true });
  return true;
}

function findElementById(id) {
  if (!id) return null;
  for (const candidate of previewElement.querySelectorAll('[id]')) {
    if (candidate.id === id) return candidate;
  }
  return null;
}

export function getHeadings() {
  return headings;
}

export function getPreviewElement() {
  return previewElement;
}

export function getPreviewPane() {
  return document.getElementById('preview-pane');
}

export function getRenderGeneration() {
  return generation;
}

/** Re-render the current source, e.g. after a palette change. */
export function refreshPreview() {
  if (previewElement) render(lastSource);
}

/**
 * Force every lazy phase to finish and wait for a stable layout so printed
 * output matches the on-screen preview.
 */
export async function preparePrint() {
  if (!previewElement) return;

  const currentGeneration = generation;
  const isCurrent = () => currentGeneration === generation;
  const diagrams = [...previewElement.querySelectorAll('.diagram-block')];
  if (diagrams.length > 0 && CAPABILITIES.diagrams) {
    await renderDiagrams(diagrams, isCurrent, { forceAll: true }).catch(() => undefined);
  }
  await Promise.allSettled([...asyncWork]);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

export function teardownPreview() {
  if (renderTimer !== null) clearTimeout(renderTimer);
  renderTimer = null;
  pendingSource = null;
  releaseObjectUrls();
  if (previewElement) {
    previewElement.removeEventListener('click', handlePreviewClick);
    previewElement.removeEventListener('keydown', handlePreviewKeydown);
  }
  removeCodeBlockControls?.();
  removeCodeBlockControls = null;
}
