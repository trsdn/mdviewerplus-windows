// Lite capability module.
//
// Resolved through the `#edition` subpath import. Lite never references a
// Full-only module, which is what physically keeps Mermaid, highlight.js,
// js-yaml, and svg-pan-zoom out of Lite artifacts.

export const EDITION = 'lite';

export const CAPABILITIES = Object.freeze({
  edition: EDITION,
  label: 'Lite',
  previewHighlighter: 'prism',
  diagrams: false,
  frontmatterCards: false,
});

export async function loadPreviewHighlighter() {
  const module = await import('../lite/prism-highlighter.js');
  return module.highlighter;
}

export async function loadFrontmatterRenderer() {
  return null;
}

export async function loadDiagramRenderer() {
  return null;
}
