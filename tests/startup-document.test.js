import assert from 'node:assert/strict';
import test from 'node:test';

import { initializeStartupDocument } from '../src/js/startup-document.js';

test('startup file leaves both editor and preview loaded after initialization', async () => {
  let editorContent = '';
  let previewContent = 'not initialized';
  const startupContent = '# Startup document';

  const opened = await initializeStartupDocument({
    renderEmpty: () => {
      previewContent = '';
    },
    takeStartupPath: async () => '/notes/startup.md',
    openStartupPath: async (path) => {
      assert.equal(path, '/notes/startup.md');
      editorContent = startupContent;
      previewContent = startupContent;
      return true;
    },
  });

  assert.equal(opened, true);
  assert.equal(editorContent, startupContent);
  assert.equal(previewContent, startupContent);
});
