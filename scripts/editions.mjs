// Shared edition model for build, audit, and packaging scripts.
// One source tree produces both editions; nothing here may fork the sources.

export const EDITIONS = Object.freeze(['lite', 'full']);

export const EDITION_LABELS = Object.freeze({
  lite: 'Lite',
  full: 'Full',
});

// Packages that may only ever appear in Full artifacts. The artifact audit
// fails the build when any of these reach a Lite output directory.
export const FULL_ONLY_PACKAGES = Object.freeze([
  'mermaid',
  'highlight.js',
  'js-yaml',
  'svg-pan-zoom',
]);

// Source markers used to detect leaked Full-only code inside minified output,
// where package paths are no longer present.
export const FULL_ONLY_CODE_MARKERS = Object.freeze([
  'svgPanZoom',
  'YAMLException',
  'mdviewer-mermaid-',
]);

export function parseEdition(value) {
  const edition = String(value || '').trim().toLowerCase();
  if (!EDITIONS.includes(edition)) {
    throw new Error(`Unknown edition '${value}'. Expected one of: ${EDITIONS.join(', ')}.`);
  }
  return edition;
}

export function editionFromArgv(argv, fallback = 'full') {
  const flag = argv.find((argument) => argument.startsWith('--edition='));
  const requested = flag ? flag.slice('--edition='.length) : process.env.MDVIEWER_EDITION || fallback;
  return parseEdition(requested);
}

export function editionConditions(edition) {
  return parseEdition(edition) === 'full' ? ['full'] : [];
}
