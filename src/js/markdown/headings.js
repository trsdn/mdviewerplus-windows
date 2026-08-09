// Heading decoration for rendered previews. Ids come from the shared slug
// contract so outline entries and fragment links always match.

import { createSlugger } from './slug.js';

const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6';

function plainHeadingText(text) {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .trim();
}

export function extractSourceHeadings(markdown) {
  const lines = String(markdown ?? '').split(/\r?\n/);
  const entries = [];
  let fence = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fenceMatch = /^[ \t]{0,3}(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (!fence) fence = marker;
      else if (fence === marker) fence = null;
      continue;
    }
    if (fence) continue;

    const atx = /^[ \t]{0,3}(#{1,6})(?:[ \t]+|$)(.*?)[ \t]*#*[ \t]*$/.exec(line);
    if (atx) {
      entries.push({
        level: atx[1].length,
        line: index + 1,
        text: plainHeadingText(atx[2]),
      });
      continue;
    }

    if (index > 0 && /^[ \t]{0,3}(=+|-+)[ \t]*$/.test(line)) {
      const previous = lines[index - 1];
      if (previous.trim() && !/^[ \t]{0,3}>/.test(previous)) {
        entries.push({
          level: line.trim().startsWith('=') ? 1 : 2,
          line: index,
          text: plainHeadingText(previous),
        });
      }
    }
  }

  return entries;
}

export function decorateHeadings(root, sourceHeadings = []) {
  const slugger = createSlugger();
  const entries = [];
  let sourceIndex = 0;

  for (const heading of root.querySelectorAll(HEADING_SELECTOR)) {
    const text = (heading.textContent || '').trim();
    const id = slugger.slug(text);
    heading.setAttribute('id', id);
    heading.setAttribute('tabindex', '-1');
    if (heading.closest('[data-footnotes], .footnotes')) continue;
    entries.push({
      id,
      level: Number(heading.tagName.slice(1)),
      line: sourceHeadings[sourceIndex]?.line ?? null,
      text,
    });
    sourceIndex += 1;
  }

  return entries;
}
