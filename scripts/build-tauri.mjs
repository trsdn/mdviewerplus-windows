import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildFrontend } from './build-frontend.mjs';
import { editionFromArgv } from './editions.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const edition = editionFromArgv(process.argv.slice(2));

await buildFrontend(edition);

const config = path.join('src-tauri', `tauri.${edition}.conf.json`);
const tauriCli = path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');
const child = spawn(process.execPath, [
  tauriCli,
  'build',
  '--config',
  config,
  '--',
  '--no-default-features',
  '--features',
  edition,
], {
  cwd: root,
  env: {
    ...process.env,
    MDVIEWER_EDITION: edition,
    CARGO_TARGET_DIR: path.join(root, 'src-tauri', 'target', edition),
  },
  stdio: 'inherit',
});

const exitCode = await new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('exit', (code, signal) => {
    if (signal) reject(new Error(`Tauri build terminated by ${signal}.`));
    else resolve(code ?? 1);
  });
});

if (exitCode !== 0) process.exit(exitCode);
