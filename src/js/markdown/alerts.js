// GitHub alert blockquotes.
//
// Only the five documented markers are recognised, the structure is built with
// trusted DOM calls after sanitization, and anything malformed keeps its plain
// blockquote rendering.

export const ALERT_TYPES = Object.freeze({
  NOTE: { label: 'Note', glyph: 'ℹ' },
  TIP: { label: 'Tip', glyph: '✦' },
  IMPORTANT: { label: 'Important', glyph: '❕' },
  WARNING: { label: 'Warning', glyph: '⚠' },
  CAUTION: { label: 'Caution', glyph: '⛔' },
});

const MARKER = /^[ \t]*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*$/;

/** Read and remove the alert marker from a blockquote's first paragraph. */
function takeMarker(paragraph) {
  const firstNode = paragraph.firstChild;
  if (!firstNode || firstNode.nodeType !== 3 /* TEXT_NODE */) return null;

  const text = firstNode.nodeValue || '';
  const newline = text.indexOf('\n');
  const firstLine = newline < 0 ? text : text.slice(0, newline);
  const match = MARKER.exec(firstLine);
  if (!match) return null;

  const remainder = newline < 0 ? '' : text.slice(newline + 1);
  if (remainder.length > 0) {
    firstNode.nodeValue = remainder.replace(/^[ \t]+/, '');
  } else {
    const next = firstNode.nextSibling;
    firstNode.remove();
    if (next && next.nodeType === 1 && next.tagName.toLowerCase() === 'br') next.remove();
  }

  if ((paragraph.textContent || '').trim() === '' && paragraph.children.length === 0) {
    paragraph.remove();
  }
  return match[1];
}

export function decorateAlerts(root) {
  const document = root.ownerDocument || globalThis.document;
  let count = 0;

  for (const quote of [...root.querySelectorAll('blockquote')]) {
    const paragraph = quote.firstElementChild;
    if (!paragraph || paragraph.tagName.toLowerCase() !== 'p') continue;

    const type = takeMarker(paragraph);
    if (!type) continue;

    const descriptor = ALERT_TYPES[type];
    const alert = document.createElement('div');
    alert.className = `markdown-alert markdown-alert-${type.toLowerCase()}`;
    alert.setAttribute('role', 'note');
    alert.setAttribute('aria-label', descriptor.label);

    const title = document.createElement('p');
    title.className = 'markdown-alert-title';

    const glyph = document.createElement('span');
    glyph.className = 'markdown-alert-icon';
    glyph.setAttribute('aria-hidden', 'true');
    glyph.textContent = descriptor.glyph;

    const label = document.createElement('span');
    label.className = 'markdown-alert-label';
    label.textContent = descriptor.label;

    title.append(glyph, label);
    alert.appendChild(title);
    while (quote.firstChild) alert.appendChild(quote.firstChild);

    quote.replaceWith(alert);
    count += 1;
  }

  return count;
}
