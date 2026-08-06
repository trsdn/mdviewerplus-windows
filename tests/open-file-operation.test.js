import assert from 'node:assert/strict';
import test from 'node:test';

import { performOpenFile } from '../src/js/open-file-operation.js';

test('open reads the target only after discard confirmation', async () => {
  const calls = [];
  let current = { path: '/notes/current.md', content: 'edited current' };

  const opened = await performOpenFile({
    confirmReplacement: async () => {
      calls.push('confirm');
      return true;
    },
    getDocumentRevision: () => 0,
    readTarget: async () => {
      calls.push('read');
      return { path: '/notes/target.md', content: 'latest disk content' };
    },
    applyTarget: (target) => {
      calls.push('apply');
      current = target;
    },
  });

  assert.equal(opened, true);
  assert.deepEqual(calls, ['confirm', 'read', 'apply']);
  assert.deepEqual(current, {
    path: '/notes/target.md',
    content: 'latest disk content',
  });
});

test('failed post-confirmation read preserves the complete current document', async () => {
  const original = { path: '/notes/current.md', content: 'edited current' };
  let current = original;
  let applied = false;
  const readFailure = new Error('read failed');

  await assert.rejects(
    performOpenFile({
      confirmReplacement: async () => true,
      getDocumentRevision: () => 0,
      readTarget: async () => {
        throw readFailure;
      },
      applyTarget: () => {
        applied = true;
      },
    }),
    readFailure,
  );

  assert.equal(applied, false);
  assert.equal(current, original);
});

test('cancel does not read or mutate the target document', async () => {
  let read = false;
  let applied = false;

  const opened = await performOpenFile({
    confirmReplacement: async () => false,
    getDocumentRevision: () => 0,
    readTarget: async () => {
      read = true;
    },
    applyTarget: () => {
      applied = true;
    },
  });

  assert.equal(opened, false);
  assert.equal(read, false);
  assert.equal(applied, false);
});

test('edit during target read can cancel replacement and preserve newer edits', async () => {
  let revision = 1;
  let current = 'original unsaved edit';
  let confirmations = 0;
  let finishRead;
  const readPending = new Promise((resolve) => { finishRead = resolve; });

  const opening = performOpenFile({
    confirmReplacement: async () => {
      confirmations += 1;
      return confirmations === 1;
    },
    getDocumentRevision: () => revision,
    readTarget: () => readPending,
    applyTarget: (target) => {
      current = target;
    },
  });

  await Promise.resolve();
  current = 'newer edit during read';
  revision += 1;
  finishRead('target content');

  assert.equal(await opening, false);
  assert.equal(confirmations, 2);
  assert.equal(current, 'newer edit during read');
});

test('edit during target read requires approval and a fresh read before apply', async () => {
  let revision = 1;
  let current = 'original unsaved edit';
  let confirmations = 0;
  let reads = 0;
  let finishFirstRead;
  const firstReadPending = new Promise((resolve) => { finishFirstRead = resolve; });

  const opening = performOpenFile({
    confirmReplacement: async () => {
      confirmations += 1;
      return true;
    },
    getDocumentRevision: () => revision,
    readTarget: async () => {
      reads += 1;
      return reads === 1 ? firstReadPending : 'fresh target content';
    },
    applyTarget: (target) => {
      current = target;
    },
  });

  await Promise.resolve();
  current = 'newer edit during read';
  revision += 1;
  finishFirstRead('stale target content');

  assert.equal(await opening, true);
  assert.equal(confirmations, 2);
  assert.equal(reads, 2);
  assert.equal(current, 'fresh target content');
});
