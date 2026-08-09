// Full-edition YAML frontmatter cards.
//
// The parser is loaded only for documents that actually start with a valid
// frontmatter delimiter. Untrusted YAML is treated as data, never as
// instructions: the failsafe schema yields only strings, lists, and maps, and
// every structural limit is enforced before anything reaches the DOM.

import { FAILSAFE_SCHEMA, load as loadYaml } from 'js-yaml';

export const FRONTMATTER_LIMITS = Object.freeze({
  maxBytes: 16 * 1024,
  maxDepth: 4,
  maxNodes: 500,
  maxEntries: 40,
  maxCollectionItems: 100,
  maxListItems: 20,
  maxValueLength: 400,
});

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
// Anchors, aliases, and explicit tags are rejected before parsing so alias
// bombs and custom constructors never reach js-yaml.
const UNSAFE_YAML = /(^|[\s:[,{])(?:[&*][^\s,[\]{}]+|![^\s,[\]{}]+)/im;

export class FrontmatterError extends Error {}

function assert(condition, message) {
  if (!condition) throw new FrontmatterError(message);
}

function inspect(value, depth, counters) {
  counters.nodes += 1;
  assert(counters.nodes <= FRONTMATTER_LIMITS.maxNodes, 'The metadata block has too many entries.');
  assert(depth <= FRONTMATTER_LIMITS.maxDepth, 'The metadata block is nested too deeply.');

  if (value === null || typeof value === 'string') return;

  if (Array.isArray(value)) {
    assert(value.length <= FRONTMATTER_LIMITS.maxCollectionItems, 'A metadata list is too long.');
    for (const item of value) inspect(item, depth + 1, counters);
    return;
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value);
    assert(keys.length <= FRONTMATTER_LIMITS.maxCollectionItems, 'A metadata map is too large.');
    for (const key of keys) {
      assert(!FORBIDDEN_KEYS.has(key), 'The metadata block uses a reserved key.');
      inspect(value[key], depth + 1, counters);
    }
    return;
  }

  throw new FrontmatterError('The metadata block contains an unsupported value.');
}

export function parseFrontmatter(source) {
  const text = String(source ?? '');
  assert(text.length <= FRONTMATTER_LIMITS.maxBytes, 'The metadata block is too large to display.');
  assert(!UNSAFE_YAML.test(text), 'The metadata block uses unsupported YAML tags or anchors.');

  let parsed;
  try {
    parsed = loadYaml(text, { schema: FAILSAFE_SCHEMA, json: true });
  } catch (error) {
    throw new FrontmatterError(error?.reason || 'The metadata block could not be read.');
  }

  if (parsed === null || parsed === undefined) return {};
  assert(
    typeof parsed === 'object' && !Array.isArray(parsed),
    'The metadata block must be a set of key/value entries.',
  );

  inspect(parsed, 1, { nodes: 0 });

  const entries = Object.entries(parsed).slice(0, FRONTMATTER_LIMITS.maxEntries);
  return Object.fromEntries(entries);
}

function formatScalar(value) {
  if (value === null || value === undefined) return '—';
  const text = String(value);
  return text.length > FRONTMATTER_LIMITS.maxValueLength
    ? `${text.slice(0, FRONTMATTER_LIMITS.maxValueLength)}…`
    : text;
}

function describeValue(value) {
  if (Array.isArray(value)) {
    const items = value.slice(0, FRONTMATTER_LIMITS.maxListItems).map((item) => (
      typeof item === 'object' && item !== null ? '…' : formatScalar(item)
    ));
    const suffix = value.length > FRONTMATTER_LIMITS.maxListItems ? ', …' : '';
    return `${items.join(', ')}${suffix}`;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).slice(0, FRONTMATTER_LIMITS.maxListItems);
    return keys.map((key) => `${key}: ${formatScalar(value[key])}`).join(' · ');
  }
  return formatScalar(value);
}

function buildCard(document, metadata) {
  const card = document.createElement('details');
  card.className = 'frontmatter-card';
  card.open = true;

  const summary = document.createElement('summary');
  summary.className = 'frontmatter-card__summary';
  summary.textContent = 'Document metadata';
  card.appendChild(summary);

  const list = document.createElement('dl');
  list.className = 'frontmatter-card__list';

  for (const [key, value] of Object.entries(metadata)) {
    const term = document.createElement('dt');
    term.textContent = formatScalar(key);
    const definition = document.createElement('dd');
    definition.textContent = describeValue(value);
    list.append(term, definition);
  }

  card.appendChild(list);
  return card;
}

function buildErrorCard(document, message) {
  const card = document.createElement('div');
  card.className = 'frontmatter-card frontmatter-card--error';
  card.setAttribute('role', 'note');

  const title = document.createElement('p');
  title.className = 'frontmatter-card__summary';
  title.textContent = 'Document metadata could not be displayed';

  const detail = document.createElement('p');
  detail.className = 'frontmatter-card__error';
  detail.textContent = message;

  card.append(title, detail);
  return card;
}

export const frontmatterRenderer = Object.freeze({
  id: 'js-yaml',

  /** Never throws: malformed metadata degrades to a local, recoverable note. */
  render(source, document = globalThis.document, { detectionError = null } = {}) {
    try {
      if (detectionError) throw new FrontmatterError(detectionError);
      const metadata = parseFrontmatter(source);
      if (Object.keys(metadata).length === 0) return null;
      return buildCard(document, metadata);
    } catch (error) {
      const message = error instanceof FrontmatterError
        ? error.message
        : 'The metadata block could not be read.';
      return buildErrorCard(document, message);
    }
  },
});
