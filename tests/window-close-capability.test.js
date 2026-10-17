import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

// @tauri-apps/api implements onCloseRequested by awaiting the handler and then
// calling Window.destroy() when the handler did not preventDefault. The window
// therefore only closes if the webview is allowed to run that destroy call.
// Without core:window:allow-destroy the IPC rejects, the rejection is swallowed
// by the async listener, and [X] silently does nothing.
test('capabilities allow the destroy call that onCloseRequested relies on', async () => {
  const [capability, main] = await Promise.all([
    readFile(path.join(root, 'src-tauri/capabilities/default.json'), 'utf8').then(JSON.parse),
    readFile(path.join(root, 'src/js/main.js'), 'utf8'),
  ]);

  assert.match(main, /onCloseRequested\(/, 'main.js must own the close-request flow');
  assert.equal(capability.windows.includes('main'), true);
  assert.equal(
    capability.permissions.includes('core:window:allow-destroy'),
    true,
    'core:window:allow-destroy is required for the window to close on [X]',
  );
});
