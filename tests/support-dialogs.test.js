import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { JSDOM } from 'jsdom';

import { initSupportDialogs, openAbout, openHelp } from '../src/js/support-dialogs.js';

const htmlPath = new URL('../src/web/index.html', import.meta.url);
const expectedLinks = [
  'https://trsdn.github.io/mdviewerplus-windows/',
  'https://github.com/trsdn/mdviewerplus-windows',
  'https://github.com/trsdn/mdviewerplus-windows/issues/new',
];

test('Help and About expose identity and open only configured support links externally', async () => {
  const dom = new JSDOM(await readFile(htmlPath, 'utf8'), {
    url: 'https://tauri.localhost/',
  });
  globalThis.document = dom.window.document;

  const opened = [];
  initSupportDialogs({
    edition: 'Lite',
    version: '2.0.1',
    openExternalUrl: (url) => opened.push(url),
  });

  for (const prefix of ['help', 'about']) {
    assert.equal(document.getElementById(`${prefix}-edition`).textContent, 'Lite');
    assert.equal(document.getElementById(`${prefix}-version`).textContent, '2.0.1');
  }
  assert.equal(document.body.textContent.match(/Copyright © 2026 Torsten Mahr/g).length, 2);

  const links = [...document.querySelectorAll('[data-support-link]')];
  assert.deepEqual([...new Set(links.map(({ href }) => href))], expectedLinks);
  for (const link of links) link.click();
  assert.deepEqual(opened, [...expectedLinks, ...expectedLinks]);

  for (const dialog of document.querySelectorAll('dialog')) {
    dialog.showModal = () => dialog.setAttribute('open', '');
  }
  openHelp();
  openAbout();
  assert.equal(document.getElementById('help-dialog').open, true);
  assert.equal(document.getElementById('about-dialog').open, true);

  delete globalThis.document;
});
