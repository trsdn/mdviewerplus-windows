import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canNavigate,
  createDocumentState,
  documentTitle,
  isDirty,
  loadedDocument,
  newDocument,
  requiresDiscardConfirmation,
  saveAsCompletion,
  savedDocument,
} from '../src/js/document-policy.js';

test('New creates a clean untitled document without carrying a resource path', () => {
  const previous = loadedDocument('C:\\notes\\old.md', '# old');
  const next = newDocument(previous);

  assert.deepEqual(next, createDocumentState(null, ''));
  assert.equal(documentTitle(next, ''), 'Untitled — MDViewer+');
  assert.equal(canNavigate(next), false);
});

test('dirty state compares editor content with the last successful load or save', () => {
  const loaded = loadedDocument('/notes/a.md', '# A');
  assert.equal(isDirty(loaded, '# A'), false);
  assert.equal(isDirty(loaded, '# changed'), true);
  assert.equal(requiresDiscardConfirmation(loaded, '# changed'), true);
  assert.equal(documentTitle(loaded, '# changed'), '* a.md — MDViewer+');

  const saved = savedDocument(loaded, null, '# changed');
  assert.equal(isDirty(saved, '# changed'), false);
  assert.equal(documentTitle(saved, '# changed'), 'a.md — MDViewer+');
});

test('Save As assigns a path only after policy receives a successful save', () => {
  const untitled = newDocument();
  assert.equal(isDirty(untitled, 'draft'), true);

  const saved = savedDocument(untitled, 'C:\\notes\\draft.markdown', 'draft');
  assert.equal(saved.path, 'C:\\notes\\draft.markdown');
  assert.equal(canNavigate(saved), true);
  assert.equal(documentTitle(saved, 'draft'), 'draft.markdown — MDViewer+');
});

test('cancel policy can leave the complete document state untouched', () => {
  const state = loadedDocument('/notes/a.md', 'saved');
  const content = 'edited';
  const snapshot = structuredClone(state);

  assert.equal(requiresDiscardConfirmation(state, content), true);
  assert.deepEqual(state, snapshot);
  assert.equal(content, 'edited');
});

test('navigation requires a saved path and dirty navigation requires confirmation', () => {
  const untitled = newDocument();
  assert.equal(canNavigate(untitled), false);

  const loaded = loadedDocument('/notes/current.md', 'original');
  assert.equal(canNavigate(loaded), true);
  assert.equal(requiresDiscardConfirmation(loaded, 'original'), false);
  assert.equal(requiresDiscardConfirmation(loaded, 'edited before next'), true);
});

test('edit during Save As keeps preview current while the saved baseline stays captured', () => {
  const completion = saveAsCompletion(
    newDocument(),
    '/notes/draft.md',
    'content sent to disk',
    'newer editor content',
  );

  assert.equal(completion.state.path, '/notes/draft.md');
  assert.equal(completion.state.savedContent, 'content sent to disk');
  assert.equal(completion.previewContent, 'newer editor content');
  assert.equal(isDirty(completion.state, completion.previewContent), true);
});
