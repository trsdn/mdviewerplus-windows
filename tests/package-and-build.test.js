import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { auditEdition } from '../scripts/audit-artifacts.mjs';
import { renderWinGetManifests } from '../scripts/generate-winget-manifests.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

test('all product manifests use version 2.0.0 and exact Full dependency pins', async () => {
  const [packageJson, cargo, tauri] = await Promise.all([
    readFile(path.join(root, 'package.json'), 'utf8').then(JSON.parse),
    readFile(path.join(root, 'src-tauri/Cargo.toml'), 'utf8'),
    readFile(path.join(root, 'src-tauri/tauri.conf.json'), 'utf8').then(JSON.parse),
  ]);
  assert.equal(packageJson.version, '2.0.0');
  assert.match(cargo, /version = "2\.0\.0"/);
  assert.equal(tauri.version, '2.0.0');
  for (const [name, version] of Object.entries({
    dompurify: '3.4.12',
    'highlight.js': '11.11.1',
    'js-yaml': '5.2.3',
    'marked-footnote': '1.4.0',
    mermaid: '11.16.0',
    prismjs: '1.30.0',
    'svg-pan-zoom': '3.6.2',
  })) {
    assert.equal(packageJson.dependencies[name], version, name);
  }
  assert.equal(packageJson.devDependencies.esbuild, '0.28.1');
});

test('clean edition outputs physically exclude opposite highlighters and Full packages', async () => {
  const [lite, full] = await Promise.all([auditEdition('lite'), auditEdition('full')]);
  assert.deepEqual(lite.violations, []);
  assert.deepEqual(full.violations, []);
  assert.ok(lite.highlighterBytes > 0 && lite.highlighterBytes <= 10 * 1024);
  for (const forbidden of ['mermaid', 'highlight.js', 'js-yaml', 'svg-pan-zoom']) {
    assert.equal(lite.packages.includes(forbidden), false, forbidden);
    assert.equal(full.packages.includes(forbidden), true, forbidden);
  }

  const liteFiles = await readdir(path.join(root, 'dist/lite/chunks'));
  const fullFiles = await readdir(path.join(root, 'dist/full/chunks'));
  assert.equal(liteFiles.some((name) => /mermaid|hljs|yaml|pan-zoom/i.test(name)), false);
  assert.equal(fullFiles.length > liteFiles.length, true);
});

test('third-party notices include exact version, source, checksum, license, and edition', async () => {
  for (const edition of ['lite', 'full']) {
    const notice = await readFile(path.join(root, `dist/${edition}/THIRD-PARTY-NOTICES.md`), 'utf8');
    assert.match(notice, /\| Package \| Version \| Source \| License \| Package checksum \| Edition \|/);
    assert.match(notice, new RegExp(`\\| (?:Lite|Full) \\|`));
    assert.match(notice, /sha512-/);
    assert.match(notice, /```text[\s\S]+```/);
  }
});

test('both edition outputs contain source web assets and no source maps', async () => {
  for (const edition of ['lite', 'full']) {
    for (const file of ['index.html', 'styles/app.css', 'styles/editor-theme.css', 'styles/preview.css']) {
      assert.ok((await stat(path.join(root, 'dist', edition, file))).isFile());
    }
    const files = await readdir(path.join(root, 'dist', edition), { recursive: true });
    assert.equal(files.some((file) => String(file).endsWith('.map')), false);
  }
});

test('command-line module entrypoints use cross-platform file URL conversion', async () => {
  for (const file of [
    'build-frontend.mjs',
    'audit-artifacts.mjs',
    'measure-builds.mjs',
    'generate-winget-manifests.mjs',
  ]) {
    const contents = await readFile(path.join(root, 'scripts', file), 'utf8');
    assert.match(contents, /fileURLToPath\(import\.meta\.url\) === path\.resolve\(process\.argv\[1\]\)/);
    assert.doesNotMatch(contents, /`file:\/\/\$\{process\.argv\[1\]\}`/);
  }
});

test('Tauri builds invoke the installed CLI without Windows command-shim spawning', async () => {
  const contents = await readFile(path.join(root, 'scripts', 'build-tauri.mjs'), 'utf8');
  assert.match(contents, /spawn\(process\.execPath,/);
  assert.match(contents, /'@tauri-apps', 'cli', 'tauri\.js'/);
  assert.doesNotMatch(contents, /npx\.cmd/);
});

test('MSI cross-edition verification forces same-version files to be replaced', async () => {
  const contents = await readFile(path.join(root, 'packaging', 'verify-cross-edition.ps1'), 'utf8');
  assert.match(contents, /REINSTALL=ALL/);
  assert.match(contents, /REINSTALLMODE=vamus/);
  assert.match(contents, /WindowsInstaller -eq 1/);
  assert.match(contents, /Get-InstalledHash \$true/);
  assert.doesNotMatch(contents, /REINSTALLMODE=vomus/);
});

test('prepared WinGet manifests target only Full current-user NSIS and are not submitted', async () => {
  const manifests = renderWinGetManifests({
    version: '2.0.0',
    installerUrl: 'https://github.com/trsdn/mdviewerplus-windows/releases/download/v2.0.0/MDViewerPlus-Full-Windows-x64-Setup.exe',
    installerSha256: 'A'.repeat(64),
  });
  const installer = manifests['Trsdn.MDViewerPlus.installer.yaml'];
  assert.match(installer, /InstallerType: nullsoft/);
  assert.match(installer, /Scope: user/);
  assert.match(installer, /Silent: \/S/);
  assert.match(installer, /UpgradeBehavior: install/);
  assert.match(installer, /InstallerSha256: A{64}/);
  assert.doesNotMatch(installer, /Lite|\.msi/);

  const workflow = await readFile(path.join(root, '.github/workflows/winget-manifests.yml'), 'utf8');
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /environment: winget-manifest-approval/);
  assert.match(workflow, /winget validate/);
  assert.doesNotMatch(workflow, /wingetcreate\s+submit|microsoft\/winget-pkgs|gh pr create/i);
});

test('sdkks/jnscnn attribution appears only in release records, never README or Pages docs', async () => {
  const attributionPattern = /sdkks|jnscnn/i;

  const [changelog, releaseWorkflow] = await Promise.all([
    readFile(path.join(root, 'CHANGELOG.md'), 'utf8'),
    readFile(path.join(root, '.github/workflows/release.yml'), 'utf8'),
  ]);
  assert.match(changelog, /sdkks\/mdviewer/);
  assert.match(changelog, /jnscnn\/mdviewer-plus-plus/);
  assert.match(releaseWorkflow, /sdkks\/mdviewer/);
  assert.match(releaseWorkflow, /jnscnn\/mdviewer-plus-plus/);

  const readme = await readFile(path.join(root, 'README.md'), 'utf8');
  assert.doesNotMatch(readme, attributionPattern);

  const docsDir = path.join(root, 'docs');
  const docsFiles = (await readdir(docsDir)).filter((name) => name.endsWith('.md'));
  for (const file of docsFiles) {
    const contents = await readFile(path.join(docsDir, file), 'utf8');
    assert.doesNotMatch(contents, attributionPattern, file);
  }
});
