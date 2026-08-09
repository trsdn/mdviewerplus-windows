import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { JSDOM } from 'jsdom';

import { highlighter as fullHighlighter, SUPPORTED_LANGUAGES as fullLanguages } from '../src/js/full/hljs-highlighter.js';
import { MERMAID_LIMITS } from '../src/js/full/mermaid-renderer.js';
import { highlighter as liteHighlighter, SUPPORTED_LANGUAGES as liteLanguages } from '../src/js/lite/prism-highlighter.js';
import { resetSanitizerForTesting } from '../src/js/security/sanitizer.js';

const dom = new JSDOM('<!doctype html><body></body>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
resetSanitizerForTesting(dom.window);

function fragmentHtml(fragment) {
  const container = dom.window.document.createElement('div');
  container.appendChild(fragment);
  return container.innerHTML;
}

test('Lite custom Prism stays on the promised explicit language set', () => {
  assert.deepEqual(liteLanguages, [
    'bash', 'css', 'html', 'javascript', 'json', 'python', 'rust', 'swift', 'typescript',
  ]);
  for (const language of liteLanguages) {
    const result = liteHighlighter.highlight('const value = "<unsafe>";', language);
    assert.ok(result, language);
    const html = fragmentHtml(result.fragment);
    assert.doesNotMatch(html, /script|img|onerror|onclick/i);
  }
  assert.equal(liteHighlighter.highlight('plain', 'unknown-language'), null);
});

test('Full highlighter provides broad bounded coverage with sanitized output', () => {
  for (const language of ['bash', 'c', 'cpp', 'csharp', 'go', 'java', 'javascript', 'python', 'rust', 'sql', 'swift', 'typescript', 'xml', 'yaml']) {
    assert.equal(fullLanguages.includes(language), true, language);
  }
  const result = fullHighlighter.highlight('<img src=x onerror=attack()>', 'xml');
  assert.ok(result);
  const html = fragmentHtml(result.fragment);
  assert.doesNotMatch(html, /<img[\s>]/i);
  assert.match(html, /&lt;/);
  assert.match(html, /hljs-/);
  assert.equal(fullHighlighter.highlight('x'.repeat(500 * 1024), 'text'), null);
});

test('Mermaid implementation is lazy, bounded, SVG-sanitized, and has no export path', async () => {
  assert.deepEqual(MERMAID_LIMITS, {
    maxDiagrams: 20,
    maxSourceCharacters: 100 * 1024,
    maxConcurrent: 2,
    timeoutMilliseconds: 12_000,
  });
  const source = await readFile(new URL('../src/js/full/mermaid-renderer.js', import.meta.url), 'utf8');
  assert.match(source, /import\('mermaid'\)/);
  assert.match(source, /sanitizeDiagramSvg\(result\.svg\)/);
  assert.match(source, /securityLevel: 'strict'/);
  assert.match(source, /htmlLabels: false/);
  assert.match(source, /sanitizeDiagramSvg\(result\.svg\)[\s\S]*await loadPanZoom\(\)/);
  assert.doesNotMatch(source, /export.*(?:png|svg)|download|saveDialog/i);
});
