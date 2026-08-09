// Shared slug contract.
//
// Rendered heading anchors, internal fragment links, and the outline popover
// all derive identifiers from this module so they can never disagree.

const STRIPPED = /[^\p{L}\p{N}\p{M}\s_-]/gu;
const WHITESPACE = /[\s_]+/gu;
const MAX_SLUG_LENGTH = 128;

export function slugify(text) {
  const normalized = String(text ?? '')
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(STRIPPED, '')
    .replace(WHITESPACE, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');

  const bounded = normalized.slice(0, MAX_SLUG_LENGTH);
  return bounded.length > 0 ? bounded : 'section';
}

/**
 * Deterministic duplicate handling: the first occurrence keeps the plain slug
 * and later occurrences receive `-1`, `-2`, … exactly like rendered anchors.
 */
export function createSlugger() {
  const counts = new Map();

  return {
    slug(text) {
      const base = slugify(text);
      const seen = counts.get(base) ?? 0;
      counts.set(base, seen + 1);
      if (seen === 0) return base;

      let candidate = `${base}-${seen}`;
      let attempt = seen;
      while (counts.has(candidate)) {
        attempt += 1;
        candidate = `${base}-${attempt}`;
      }
      counts.set(candidate, 1);
      return candidate;
    },
    reset() {
      counts.clear();
    },
  };
}
