import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { auditEdition } from './audit-artifacts.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function collectBuildMetrics() {
  const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const lite = await auditEdition('lite');
  const full = await auditEdition('full');
  return {
    version: packageJson.version,
    units: 'bytes',
    lite: {
      entryJavaScript: lite.entryBytes,
      allJavaScript: lite.javascriptBytes,
      allWebAssets: lite.totalBytes,
      prismChunk: lite.highlighterBytes,
      bundledPackages: lite.packages.length,
    },
    full: {
      entryJavaScript: full.entryBytes,
      allJavaScript: full.javascriptBytes,
      allWebAssets: full.totalBytes,
      bundledPackages: full.packages.length,
    },
    fullMinusLite: {
      entryJavaScript: full.entryBytes - lite.entryBytes,
      allJavaScript: full.javascriptBytes - lite.javascriptBytes,
      allWebAssets: full.totalBytes - lite.totalBytes,
    },
    assertions: {
      liteFullOnlyViolations: lite.violations,
      fullLazyEntryViolations: full.violations,
    },
    windowsOnlyPending: [
      'cold launch and idle CPU',
      'live preview typing latency in WebView2',
      'Mermaid memory and render latency in WebView2',
      'NSIS and MSI compressed installer sizes',
      'Lite-to-Full and Full-to-Lite installer replacement',
    ],
  };
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const metrics = await collectBuildMetrics();
  const output = path.join(root, 'docs', 'build-metrics.json');
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(metrics, null, 2)}\n`);
  console.log(`Wrote ${path.relative(root, output)}.`);
}
