import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

import {
  initPreview,
  renderMarkdown,
  teardownPreview,
} from '../src/js/markdown/pipeline.js';
import { resetSanitizerForTesting } from '../src/js/security/sanitizer.js';

test('hardened Lite pipeline sanitizes then adds shared rendering features', async () => {
  const dom = new JSDOM(`<!doctype html><body>
    <div id="preview-pane"><div id="preview-content"></div></div>
  </body>`, { url: 'https://tauri.localhost/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.NodeFilter = dom.window.NodeFilter;
  globalThis.URL = dom.window.URL;
  resetSanitizerForTesting(dom.window);

  let outline = [];
  initPreview({
    loadImage: async () => null,
    onOutlineChange: (entries) => { outline = entries; },
  });
  const result = renderMarkdown(`
# Title

<script>attack()</script>
<img src="https://evil.example/pixel.png" onerror="attack()">

> [!NOTE]
> Safe alert

- [x] Finished

Text with a footnote.[^1]

[^1]: Footnote text.

\`\`\`js
const value = "<safe>";
\`\`\`
  `);
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(result.headings.length >= 1, true);
  assert.equal(outline.find((entry) => entry.text === 'Title')?.id, 'title');
  const preview = dom.window.document.getElementById('preview-content');
  assert.equal(preview.querySelector('script'), null);
  assert.equal(preview.querySelector('[onerror]'), null);
  assert.ok(preview.querySelector('.preview-image-blocked'));
  assert.ok(preview.querySelector('.markdown-alert-note'));
  assert.ok(preview.querySelector('.task-list-item'));
  assert.ok(preview.querySelector('.footnotes'));
  assert.ok(preview.querySelector('.code-block'));
  assert.equal(preview.querySelector('.code-block code').textContent.includes('<safe>'), true);
  teardownPreview();
});
