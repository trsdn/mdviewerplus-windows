import assert from 'node:assert/strict';
import test from 'node:test';

import { createDocumentOperationQueue } from '../src/js/document-operation-queue.js';
import {
  isDirty,
  loadedDocument,
  newDocument,
  saveAsCompletion,
  savedDocument,
} from '../src/js/document-policy.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test('out-of-order open completions cannot let an older open overwrite a newer request', async () => {
  const queue = createDocumentOperationQueue();
  const firstRead = deferred();
  const secondRead = deferred();
  const started = [];
  let state = newDocument();
  let editorContent = '';

  const firstOpen = queue.enqueue(async () => {
    started.push('first');
    const content = await firstRead.promise;
    state = loadedDocument('/notes/first.md', content);
    editorContent = content;
  });
  const secondOpen = queue.enqueue(async () => {
    started.push('second');
    const content = await secondRead.promise;
    state = loadedDocument('/notes/second.md', content);
    editorContent = content;
  });

  await Promise.resolve();
  assert.deepEqual(started, ['first']);
  secondRead.resolve('second content');
  await Promise.resolve();
  assert.equal(state.path, null);

  firstRead.resolve('first content');
  await Promise.all([firstOpen, secondOpen]);
  assert.deepEqual(started, ['first', 'second']);
  assert.equal(state.path, '/notes/second.md');
  assert.equal(editorContent, 'second content');
});

test('out-of-order save completions use captured paths and never mark newer content clean', async () => {
  const queue = createDocumentOperationQueue();
  const firstWrite = deferred();
  const secondWrite = deferred();
  let state = loadedDocument('/notes/current.md', 'saved');
  let editorContent = 'first edit';
  const writes = [];
  const dirtyAfterCompletion = [];

  const save = (completion) => queue.enqueue(async () => {
    const capturedPath = state.path;
    const capturedContent = editorContent;
    writes.push({ path: capturedPath, contents: capturedContent });
    await completion.promise;
    state = savedDocument(state, capturedPath, capturedContent);
    dirtyAfterCompletion.push(isDirty(state, editorContent));
  });

  const firstSave = save(firstWrite);
  await Promise.resolve();
  editorContent = 'newer edit';
  const secondSave = save(secondWrite);

  secondWrite.resolve();
  firstWrite.resolve();
  await Promise.all([firstSave, secondSave]);

  assert.deepEqual(writes, [
    { path: '/notes/current.md', contents: 'first edit' },
    { path: '/notes/current.md', contents: 'newer edit' },
  ]);
  assert.deepEqual(dirtyAfterCompletion, [true, false]);
  assert.equal(state.savedContent, 'newer edit');
});

test('delayed Save As cannot associate content from a later open with its old target', async () => {
  const queue = createDocumentOperationQueue();
  const saveAsWrite = deferred();
  const laterOpenRead = deferred();
  let state = newDocument();
  let editorContent = 'draft';
  let previewContent = 'draft';
  let written;

  const saveAs = queue.enqueue(async () => {
    const selectedPath = '/notes/draft.md';
    const capturedContent = editorContent;
    written = { path: selectedPath, contents: capturedContent };
    await saveAsWrite.promise;
    const completion = saveAsCompletion(
      state,
      selectedPath,
      capturedContent,
      editorContent,
    );
    state = completion.state;
    previewContent = completion.previewContent;
  });
  await Promise.resolve();

  editorContent = 'draft edited while saving';
  const open = queue.enqueue(async () => {
    const openedContent = await laterOpenRead.promise;
    state = loadedDocument('/notes/opened.md', openedContent);
    editorContent = openedContent;
  });

  laterOpenRead.resolve('opened content');
  await Promise.resolve();
  assert.equal(state.path, null);

  saveAsWrite.resolve();
  await saveAs;
  assert.deepEqual(written, { path: '/notes/draft.md', contents: 'draft' });
  assert.equal(state.path, '/notes/draft.md');
  assert.equal(isDirty(state, editorContent), true);
  assert.equal(previewContent, 'draft edited while saving');

  await open;
  assert.equal(state.path, '/notes/opened.md');
  assert.equal(editorContent, 'opened content');
  assert.equal(isDirty(state, editorContent), false);
});
