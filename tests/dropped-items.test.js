import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyDropped,
  extraDocumentsMessage,
  isMarkdownPath,
  rejectionMessage,
} from '../src/js/dropped-items.js';

const file = (path) => ({ path, kind: 'file' });
const directory = (path) => ({ path, kind: 'directory' });
const missing = (path) => ({ path, kind: 'missing' });

test('markdown extensions are recognized regardless of case', () => {
  assert.equal(isMarkdownPath('C:\\notes\\guide.md'), true);
  assert.equal(isMarkdownPath('C:\\notes\\README.MARKDOWN'), true);
  assert.equal(isMarkdownPath('/notes/api.mkd'), true);
  assert.equal(isMarkdownPath('C:\\notes\\diagram.png'), false);
  assert.equal(isMarkdownPath('C:\\notes\\.md'), false);
});

test('folders, markdown files and the rest are separated', () => {
  const result = classifyDropped([
    directory('C:\\notes'),
    file('C:\\notes\\guide.md'),
    file('C:\\notes\\diagram.png'),
  ]);

  assert.deepEqual(result.folders, ['C:\\notes']);
  assert.deepEqual(result.markdownFiles, ['C:\\notes\\guide.md']);
  assert.deepEqual(result.unsupported, ['C:\\notes\\diagram.png']);
});

test('missing items are unsupported even with a markdown extension', () => {
  const result = classifyDropped([missing('C:\\notes\\gone.md')]);

  assert.deepEqual(result.markdownFiles, []);
  assert.deepEqual(result.unsupported, ['C:\\notes\\gone.md']);
});

test('duplicates are collapsed and drop order is preserved', () => {
  const result = classifyDropped([
    file('C:\\notes\\guide.md'),
    file('C:\\notes\\api.md'),
    file('C:\\notes\\guide.md'),
  ]);

  assert.deepEqual(result.markdownFiles, ['C:\\notes\\guide.md', 'C:\\notes\\api.md']);
});

test('malformed entries are ignored', () => {
  const result = classifyDropped([null, { kind: 'file' }, file('')]);

  assert.deepEqual(result, { markdownFiles: [], folders: [], unsupported: [] });
});

test('rejection messages name one item and count several', () => {
  assert.match(rejectionMessage(['C:\\notes\\diagram.png']), /diagram\.png/);
  assert.match(rejectionMessage(['a.png', 'b.png']), /2 dropped items/);
  assert.match(rejectionMessage([]), /\.markdown/);
});

test('extra documents message only appears beyond the first file', () => {
  assert.equal(extraDocumentsMessage(['C:\\notes\\guide.md']), '');
  const message = extraDocumentsMessage(['C:\\a\\guide.md', 'C:\\a\\api.md', 'C:\\a\\x.md']);
  assert.match(message, /guide\.md/);
  assert.match(message, /2 other files were not opened/);
});
