const MAX_MATCHES = 1000;

let root = null;
let panel = null;
let input = null;
let status = null;
let matches = [];
let current = -1;
let previousFocus = null;

function captureSelection() {
  const selection = root?.ownerDocument.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const beforeStart = root.ownerDocument.createRange();
  beforeStart.selectNodeContents(root);
  beforeStart.setEnd(range.startContainer, range.startOffset);
  const beforeEnd = root.ownerDocument.createRange();
  beforeEnd.selectNodeContents(root);
  beforeEnd.setEnd(range.endContainer, range.endOffset);
  return { start: beforeStart.toString().length, end: beforeEnd.toString().length };
}

function pointAtOffset(offset) {
  const nodeFilter = root.ownerDocument.defaultView?.NodeFilter || globalThis.NodeFilter;
  const walker = root.ownerDocument.createTreeWalker(root, nodeFilter.SHOW_TEXT);
  let remaining = offset;
  while (walker.nextNode()) {
    const length = walker.currentNode.nodeValue?.length || 0;
    if (remaining <= length) return { node: walker.currentNode, offset: remaining };
    remaining -= length;
  }
  return { node: root, offset: root.childNodes.length };
}

function restoreSelection(saved) {
  if (!saved) return;
  const selection = root.ownerDocument.getSelection();
  if (!selection) return;
  const start = pointAtOffset(saved.start);
  const end = pointAtOffset(saved.end);
  const range = root.ownerDocument.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  selection.removeAllRanges();
  selection.addRange(range);
}

function acceptedTextNode(node) {
  if (!node.nodeValue?.trim()) return false;
  const parent = node.parentElement;
  return !parent?.closest(
    'button, input, textarea, select, .code-block__header, .code-block__status, .preview-find-panel',
  );
}

function clearMarks() {
  if (!root) return;
  for (const mark of [...root.querySelectorAll('mark[data-preview-find]')]) {
    mark.replaceWith(mark.ownerDocument.createTextNode(mark.textContent || ''));
  }
  root.normalize();
  matches = [];
  current = -1;
}

function updateStatus() {
  if (!status) return;
  status.textContent = matches.length === 0
    ? 'No matches'
    : `${current + 1} of ${matches.length}${matches.length === MAX_MATCHES ? '+' : ''}`;
}

function selectMatch(index) {
  if (matches.length === 0) {
    updateStatus();
    return false;
  }
  if (current >= 0) matches[current]?.classList.remove('preview-find-current');
  current = (index + matches.length) % matches.length;
  const match = matches[current];
  match.classList.add('preview-find-current');
  match.scrollIntoView({ block: 'center', inline: 'nearest' });
  updateStatus();
  return true;
}

function search() {
  const savedSelection = captureSelection();
  clearMarks();
  const query = input.value;
  if (!query) {
    status.textContent = '';
    restoreSelection(savedSelection);
    return;
  }
  const needle = query.toLocaleLowerCase();
  const nodeFilter = root.ownerDocument.defaultView?.NodeFilter || globalThis.NodeFilter;
  const walker = document.createTreeWalker(root, nodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) {
    if (acceptedTextNode(walker.currentNode)) nodes.push(walker.currentNode);
  }

  for (const node of nodes) {
    if (matches.length >= MAX_MATCHES) break;
    const text = node.nodeValue || '';
    const lower = text.toLocaleLowerCase();
    let offset = 0;
    let found = lower.indexOf(needle);
    if (found < 0) continue;
    const fragment = document.createDocumentFragment();

    while (found >= 0 && matches.length < MAX_MATCHES) {
      fragment.append(document.createTextNode(text.slice(offset, found)));
      const mark = document.createElement('mark');
      mark.dataset.previewFind = '';
      mark.className = 'preview-find-match';
      mark.textContent = text.slice(found, found + query.length);
      fragment.append(mark);
      matches.push(mark);
      offset = found + query.length;
      found = lower.indexOf(needle, offset);
    }
    fragment.append(document.createTextNode(text.slice(offset)));
    node.replaceWith(fragment);
  }

  selectMatch(0);
  restoreSelection(savedSelection);
}

export function initPreviewFind() {
  root = document.getElementById('preview-content');
  panel = document.getElementById('preview-find');
  input = document.getElementById('preview-find-input');
  status = document.getElementById('preview-find-status');

  input.addEventListener('input', search);
  document.getElementById('preview-find-next').addEventListener('click', () => selectMatch(current + 1));
  document.getElementById('preview-find-previous').addEventListener('click', () => selectMatch(current - 1));
  document.getElementById('preview-find-close').addEventListener('click', closePreviewFind);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      selectMatch(current + (event.shiftKey ? -1 : 1));
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closePreviewFind();
    }
  });
}

export function openPreviewFind() {
  previousFocus = document.activeElement;
  panel.hidden = false;
  input.focus();
  input.select();
  if (input.value) search();
}

export function closePreviewFind() {
  if (!panel || panel.hidden) return;
  const savedSelection = captureSelection();
  clearMarks();
  restoreSelection(savedSelection);
  panel.hidden = true;
  status.textContent = '';
  previousFocus?.focus?.();
}

export function previewFindNext(previous = false) {
  if (panel?.hidden) openPreviewFind();
  else selectMatch(current + (previous ? -1 : 1));
}

export function refreshPreviewFind() {
  if (panel && !panel.hidden && input.value) search();
}

export function isPreviewFindOpen() {
  return Boolean(panel && !panel.hidden);
}
