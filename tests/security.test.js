import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { JSDOM } from 'jsdom';

import {
  resetSanitizerForTesting,
  sanitizeDiagramSvg,
  sanitizeHighlightedCodeFragment,
  sanitizeMarkdownHtml,
} from '../src/js/security/sanitizer.js';
import {
  LINK_KIND,
  classifyImageSource,
  classifyLink,
  isAllowedExternalUrl,
  isSafeRelativeMarkdownPath,
} from '../src/js/security/url-policy.js';

const dom = new JSDOM('<!doctype html><body></body>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
resetSanitizerForTesting(dom.window);

test('Markdown sanitizer removes active content before insertion', () => {
  const clean = sanitizeMarkdownHtml(`
    <h1 onclick="attack()">Safe</h1>
    <script>attack()</script>
    <iframe src="https://evil.example"></iframe>
    <a href="javascript:attack()">bad</a>
    <a href="notes/next.md#part">good</a>
    <img src="data:text/html,evil" onerror="attack()">
    <svg onload="attack()"><script>attack()</script></svg>
  `);

  assert.match(clean, /<h1>Safe<\/h1>/);
  assert.match(clean, /href="notes\/next\.md#part"/);
  assert.doesNotMatch(clean, /script|iframe|onclick|onerror|javascript:|data:|<svg/i);
});

test('highlight sanitizer permits only constrained span classes', () => {
  const fragment = sanitizeHighlightedCodeFragment(
    '<span class="hljs-keyword ok bad:name">const</span><img src=x onerror=attack()>',
  );
  const container = dom.window.document.createElement('div');
  container.appendChild(fragment);
  assert.equal(container.querySelectorAll('span').length, 1);
  assert.equal(container.querySelector('span').className, 'hljs-keyword ok');
  assert.equal(container.querySelector('img'), null);
  assert.equal(container.textContent, 'const');
});

test('diagram sanitizer rejects script, navigation, foreign objects, and CSS URLs', () => {
  const svg = sanitizeDiagramSvg(`
    <svg xmlns="http://www.w3.org/2000/svg" onload="attack()">
      <script>attack()</script>
      <foreignObject><div>unsafe</div></foreignObject>
      <a href="https://evil.example"><text>link</text></a>
      <image href="https://evil.example/pixel.png"/>
      <rect style="fill:url(https://evil.example/x)"/>
      <text>safe</text>
    </svg>
  `);
  assert.ok(svg);
  assert.equal(svg.querySelector('script, foreignObject, a, image'), null);
  assert.equal(svg.querySelector('rect')?.hasAttribute('style'), false);
  assert.match(svg.textContent, /safe/);
  assert.equal(svg.hasAttribute('onload'), false);
});

test('URL policy allows narrow external schemes and confined Markdown links', () => {
  assert.equal(isAllowedExternalUrl('https://example.com/note'), true);
  assert.equal(isAllowedExternalUrl('mailto:reader@example.com'), true);
  for (const blocked of ['javascript:alert(1)', 'file:///secret', 'data:text/html,x', 'shell:calc']) {
    assert.equal(isAllowedExternalUrl(blocked), false, blocked);
    assert.equal(classifyLink(blocked).kind, LINK_KIND.blocked, blocked);
  }

  for (const allowed of ['other.md', 'folder/My%20Note.markdown', 'a/b/c.MKD']) {
    assert.equal(isSafeRelativeMarkdownPath(allowed), true, allowed);
    assert.equal(classifyLink(allowed).kind, LINK_KIND.internal, allowed);
  }
  for (const blocked of [
    '../secret.md',
    '%2e%2e/secret.md',
    'folder%2fsecret.md',
    '/absolute.md',
    '//server/share.md',
    'C:/secret.md',
    'notes.md?raw=1',
    'folder/',
    'image.png',
  ]) {
    assert.equal(isSafeRelativeMarkdownPath(blocked), false, blocked);
  }
});

test('local image policy is offline and excludes SVG', () => {
  assert.equal(classifyImageSource('images/screenshot.png').kind, LINK_KIND.internal);
  for (const blocked of [
    'https://example.com/image.png',
    'data:image/png;base64,AAAA',
    '../image.png',
    'diagram.svg',
    'file:///image.png',
  ]) {
    assert.equal(classifyImageSource(blocked).kind, LINK_KIND.blocked, blocked);
  }
});

test('Tauri CSP and capabilities expose no unsafe scripts or broad filesystem/shell access', async () => {
  const [configText, capabilitiesText, pipelineSource] = await Promise.all([
    readFile(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'),
    readFile(new URL('../src-tauri/capabilities/default.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/js/markdown/pipeline.js', import.meta.url), 'utf8'),
  ]);
  const config = JSON.parse(configText);
  const capabilities = JSON.parse(capabilitiesText);
  const csp = config.app.security.csp;

  assert.match(csp, /script-src 'self'/);
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
  assert.match(csp, /connect-src 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-src 'none'/);
  assert.match(csp, /base-uri 'none'/);
  assert.match(csp, /form-action 'none'/);
  assert.equal(config.app.security.assetProtocol, undefined);
  assert.equal(capabilities.permissions.some((permission) => permission.startsWith('fs:')), false);
  assert.equal(capabilities.permissions.some((permission) => permission.startsWith('shell:')), false);
  assert.doesNotMatch(pipelineSource, /\.innerHTML\s*=/);
  assert.match(pipelineSource, /sanitizeMarkdownFragment\(html\)/);
  const sanitizerSource = await readFile(new URL('../src/js/security/sanitizer.js', import.meta.url), 'utf8');
  assert.doesNotMatch(sanitizerSource, /IN_PLACE\s*:/);
});
