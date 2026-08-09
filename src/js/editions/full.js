// Full capability module.
//
// Every Full-only dependency is reached through a dynamic import so that an
// ordinary Markdown document never loads highlight.js, js-yaml, Mermaid, or
// svg-pan-zoom.

export const EDITION = 'full';

export const CAPABILITIES = Object.freeze({
  edition: EDITION,
  label: 'Full',
  previewHighlighter: 'highlight.js',
  diagrams: true,
  frontmatterCards: true,
});

export async function loadPreviewHighlighter() {
  const module = await import('../full/hljs-highlighter.js');
  return module.highlighter;
}

export async function loadFrontmatterRenderer() {
  const module = await import('../full/yaml-frontmatter.js');
  return module.frontmatterRenderer;
}

export async function loadDiagramRenderer() {
  const module = await import('../full/mermaid-renderer.js');
  return module.diagramRenderer;
}
