// Frontmatter detection.
//
// Detection is edition-independent and dependency-free; only Full parses the
// detected block, and only through a restricted YAML schema.

export const FRONTMATTER_LIMITS = Object.freeze({
  maxBytes: 16 * 1024,
  maxLines: 200,
});

const OPENING = /^---[ \t]*\r?\n/;

/**
 * Split a leading `---` fenced block from the Markdown body.
 * The block is removed from the body exactly once and only when a matching
 * closing delimiter is found within the configured limits.
 */
export function splitFrontmatter(markdown) {
  const source = typeof markdown === 'string' ? markdown : '';
  const withoutBom = source.startsWith('\uFEFF') ? source.slice(1) : source;
  if (!OPENING.test(withoutBom)) {
    return { frontmatter: null, body: source, error: null };
  }

  const openingLength = withoutBom.match(OPENING)[0].length;
  const rest = withoutBom.slice(openingLength);
  const lines = [];
  let consumed = 0;
  let closed = false;

  for (const line of rest.split('\n')) {
    if (lines.length >= FRONTMATTER_LIMITS.maxLines) {
      return {
        frontmatter: '',
        body: source,
        error: 'The metadata block exceeds the supported line limit.',
      };
    }
    consumed += line.length + 1;
    if (consumed > FRONTMATTER_LIMITS.maxBytes) {
      return {
        frontmatter: '',
        body: source,
        error: 'The metadata block exceeds the supported size limit.',
      };
    }
    const trimmed = line.replace(/\r$/, '');
    if (trimmed === '---' || trimmed === '...') {
      closed = true;
      break;
    }
    lines.push(trimmed);
  }

  if (!closed) {
    return {
      frontmatter: '',
      body: source,
      error: 'The metadata block has no closing delimiter.',
    };
  }

  const body = rest.slice(Math.min(consumed, rest.length));
  return {
    frontmatter: lines.join('\n'),
    body: body.replace(/^\r?\n/, ''),
    error: null,
  };
}

export function hasFrontmatterDelimiter(markdown) {
  const source = typeof markdown === 'string' ? markdown : '';
  const withoutBom = source.startsWith('\uFEFF') ? source.slice(1) : source;
  return OPENING.test(withoutBom);
}
