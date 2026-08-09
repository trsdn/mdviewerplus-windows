import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

import { parseFrontmatter, FrontmatterError } from '../src/js/full/yaml-frontmatter.js';
import { decorateAlerts } from '../src/js/markdown/alerts.js';
import { decorateCodeBlocks, getBlockSource } from '../src/js/markdown/code-blocks.js';
import { splitFrontmatter } from '../src/js/markdown/frontmatter.js';
import { decorateHeadings, extractSourceHeadings } from '../src/js/markdown/headings.js';
import { decorateImages } from '../src/js/markdown/images.js';
import { slugify } from '../src/js/markdown/slug.js';
import { decorateTaskLists } from '../src/js/markdown/task-lists.js';
import { filterQuickOpenFiles } from '../src/js/quick-open.js';

function fragment(html) {
  const document = new JSDOM('<!doctype html><body></body>').window.document;
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.content;
}

test('heading extraction supports ATX, setext, duplicates, Unicode, and fenced-code exclusion', () => {
  const source = [
    '# Héllo',
    '## Repeat',
    '## Repeat',
    'Setext heading',
    '---',
    '```md',
    '# Not a heading',
    '```',
  ].join('\n');
  const sourceEntries = extractSourceHeadings(source);
  const root = fragment('<h1>Héllo</h1><h2>Repeat</h2><h2>Repeat</h2><h2>Setext heading</h2>');
  const entries = decorateHeadings(root, sourceEntries);

  assert.deepEqual(entries.map(({ id, line }) => ({ id, line })), [
    { id: 'héllo', line: 1 },
    { id: 'repeat', line: 2 },
    { id: 'repeat-1', line: 3 },
    { id: 'setext-heading', line: 4 },
  ]);
  assert.equal(slugify('東京 café'), '東京-café');
});

test('frontmatter is split exactly once and malformed blocks preserve the Markdown body', () => {
  const valid = splitFrontmatter('---\ntitle: Hello\n---\n# Body');
  assert.equal(valid.frontmatter, 'title: Hello');
  assert.equal(valid.body, '# Body');
  assert.equal(valid.error, null);

  const malformed = splitFrontmatter('---\ntitle: Missing close\n# Body');
  assert.equal(malformed.body, '---\ntitle: Missing close\n# Body');
  assert.match(malformed.error, /closing delimiter/);
});

test('Full YAML parser uses bounded failsafe data and rejects hostile structures', () => {
  assert.deepEqual(parseFrontmatter('title: Hello\ntags:\n  - one\n  - two'), {
    title: 'Hello',
    tags: ['one', 'two'],
  });
  for (const hostile of [
    'value: !!js/function function(){}',
    'base: &base [one]\ncopy: *base',
    '__proto__: polluted',
    `deep:\n${Array.from({ length: 6 }, (_, index) => `${'  '.repeat(index + 1)}child:`).join('\n')}\n${'  '.repeat(7)}value: x`,
    `many:\n${Array.from({ length: 120 }, (_, index) => `  - ${index}`).join('\n')}`,
  ]) {
    assert.throws(() => parseFrontmatter(hostile), FrontmatterError, hostile);
  }
});

test('alerts and task lists use trusted accessible DOM construction', () => {
  const root = fragment(
    '<blockquote><p>[!WARNING]<br>Careful</p></blockquote>'
      + '<ul><li><input type="checkbox" checked>Ship</li></ul>',
  );
  assert.equal(decorateAlerts(root), 1);
  assert.equal(decorateTaskLists(root), 1);
  const alert = root.querySelector('.markdown-alert-warning');
  assert.equal(alert.getAttribute('role'), 'note');
  assert.match(alert.textContent, /Warning/);
  const checkbox = root.querySelector('input');
  assert.equal(checkbox.disabled, true);
  assert.equal(checkbox.getAttribute('aria-readonly'), 'true');
  assert.equal(root.querySelector('li').dataset.taskState, 'done');
});

test('code controls retain exact parser source independently of highlighted DOM', () => {
  const root = fragment('<pre><code class="language-js">normalized</code></pre>');
  const [{ figure, code }] = decorateCodeBlocks(root, {
    sourceBlocks: [{ source: 'const exact = \"<tag>\";\n' }],
  }).blocks;
  code.replaceChildren(code.ownerDocument.createTextNode('highlighted'));
  assert.equal(getBlockSource(figure), 'const exact = "<tag>";\n');
  assert.equal(figure.querySelector('[data-code-action="copy"]').textContent, 'Copy');
  assert.equal(figure.querySelector('[data-code-action="wrap"]').getAttribute('aria-pressed'), 'false');
});

test('image decoration strips raw URLs before native resolution', () => {
  const root = fragment(
    '<img src="images/local.png" alt="Local"><img src="https://example.com/remote.png" alt="Remote">',
  );
  const pending = decorateImages(root);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].path, 'images/local.png');
  assert.equal(pending[0].image.hasAttribute('src'), false);
  assert.equal(pending[0].image.getAttribute('role'), 'button');
  assert.ok(root.querySelector('.preview-image-blocked'));
});

test('Quick Open filtering is deterministic, bounded, and current-snapshot only', () => {
  const files = [
    { name: 'Beta.md', path: 'C:/notes/Beta.md' },
    { name: 'alpha.md', path: 'C:/notes/alpha.md' },
    { name: 'alphabet.md', path: 'C:/notes/alphabet.md' },
  ];
  assert.deepEqual(
    filterQuickOpenFiles(files, 'alp').map((file) => file.name),
    ['alpha.md', 'alphabet.md'],
  );
  assert.deepEqual(
    filterQuickOpenFiles(files, '').map((file) => file.name),
    ['alpha.md', 'alphabet.md', 'Beta.md'],
  );
});
