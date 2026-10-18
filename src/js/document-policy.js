export const UNTITLED_NAME = 'Untitled';

export function createDocumentState(path = null, savedContent = '') {
  return { path, savedContent };
}

export function normalizeLineEndings(content) {
  return content.replace(/\r\n?/g, '\n');
}

export function loadedDocument(path, content) {
  if (!path) throw new TypeError('A loaded document requires a path.');
  // The editor stores line breaks as LF, so the load baseline has to use the
  // same form; otherwise every CRLF file would look dirty right after opening.
  return createDocumentState(path, normalizeLineEndings(content));
}

export function newDocument() {
  return createDocumentState();
}

export function savedDocument(state, path, content) {
  const savedPath = path || state.path;
  if (!savedPath) throw new TypeError('A saved document requires a path.');
  return createDocumentState(savedPath, content);
}

export function saveAsCompletion(state, path, savedContent, currentContent) {
  return {
    state: savedDocument(state, path, savedContent),
    previewContent: currentContent,
  };
}

export function isDirty(state, currentContent) {
  return currentContent !== state.savedContent;
}

export function requiresDiscardConfirmation(state, currentContent) {
  return isDirty(state, currentContent);
}

export function fileName(path) {
  return path ? path.split(/[/\\]/).pop() || UNTITLED_NAME : UNTITLED_NAME;
}

export function documentTitle(state, currentContent) {
  const dirtyMarker = isDirty(state, currentContent) ? '* ' : '';
  return `${dirtyMarker}${fileName(state.path)} — MDViewer+`;
}

export function canNavigate(state) {
  return Boolean(state.path);
}
