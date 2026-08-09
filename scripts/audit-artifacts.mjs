// Artifact audit: proves the Lite output physically excludes Full-only code
// and reports the measured web-asset budget for both editions.

import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { EDITIONS, EDITION_LABELS, FULL_ONLY_CODE_MARKERS, FULL_ONLY_PACKAGES } from './editions.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath ?? entry.path, entry.name));
}

export async function auditEdition(edition) {
  const outputDirectory = path.join(repositoryRoot, 'dist', edition);
  const metafile = JSON.parse(
    await readFile(path.join(repositoryRoot, 'dist', `metafile-${edition}.json`), 'utf8'),
  );

  const bundledPackages = new Set(
    Object.keys(metafile.inputs)
      .filter((input) => input.includes('node_modules/'))
      .map((input) => {
        const rest = input.slice(input.lastIndexOf('node_modules/') + 'node_modules/'.length);
        const segments = rest.split('/');
        return segments[0].startsWith('@') ? `${segments[0]}/${segments[1]}` : segments[0];
      }),
  );

  const files = await listFiles(outputDirectory);
  let totalBytes = 0;
  let javascriptBytes = 0;
  const violations = [];
  const inputPaths = Object.keys(metafile.inputs);

  for (const file of files) {
    const size = (await stat(file)).size;
    totalBytes += size;
    if (file.endsWith('.js')) javascriptBytes += size;

    if (edition !== 'lite' || !file.endsWith('.js')) continue;
    const contents = await readFile(file, 'utf8');
    for (const marker of FULL_ONLY_CODE_MARKERS) {
      if (contents.includes(marker)) {
        violations.push(`${path.relative(repositoryRoot, file)} contains Full-only marker '${marker}'`);
      }
    }
  }

  if (edition === 'lite') {
    for (const forbidden of FULL_ONLY_PACKAGES) {
      if (bundledPackages.has(forbidden)) {
        violations.push(`Lite bundle links the Full-only package '${forbidden}'`);
      }
      for (const input of inputPaths) {
        if (input.includes('/src/js/full/') || input.includes('\\src\\js\\full\\')) {
          violations.push(`Lite bundle includes Full-only source '${input}'`);
        }
      }
    }
    const notices = await readFile(path.join(outputDirectory, 'THIRD-PARTY-NOTICES.md'), 'utf8');
    for (const forbidden of FULL_ONLY_PACKAGES) {
      if (notices.includes(`| ${forbidden} |`)) {
        violations.push(`Lite notices mention the Full-only package '${forbidden}'`);
      }
    }
  }

  if (edition === 'full') {
    for (const required of FULL_ONLY_PACKAGES) {
      if (!bundledPackages.has(required)) {
        violations.push(`Full bundle is missing the required package '${required}'`);
      }
    }
    const entry = Object.entries(metafile.outputs).find(([output]) => output.endsWith('/bundle.js'));
    if (entry) {
      const eagerInputs = Object.keys(entry[1].inputs);
      for (const required of FULL_ONLY_PACKAGES) {
        if (eagerInputs.some((input) => input.includes(`node_modules/${required}/`))) {
          violations.push(`Full entry eagerly includes lazy package '${required}'`);
        }
      }
    }
  }

  const entryBytes = (await stat(path.join(outputDirectory, 'bundle.js'))).size;
  const highlighterBytes = Object.entries(metafile.outputs)
    .filter(([, output]) => Object.keys(output.inputs).some((input) => input.includes('prism-highlighter.js')))
    .reduce((total, [, output]) => total + output.bytes, 0);
  if (edition === 'lite' && highlighterBytes > 10 * 1024) {
    violations.push(`Lite Prism output is ${highlighterBytes} bytes; the limit is 10240 bytes`);
  }

  return {
    edition,
    files: files.length,
    totalBytes,
    javascriptBytes,
    entryBytes,
    highlighterBytes,
    packages: [...bundledPackages].sort(),
    violations,
  };
}

function formatKilobytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let failed = false;
  for (const edition of EDITIONS) {
    const report = await auditEdition(edition);
    console.log(
      `${EDITION_LABELS[edition]}: ${report.files} files, entry ${formatKilobytes(report.entryBytes)}, `
        + `JavaScript ${formatKilobytes(report.javascriptBytes)}, total ${formatKilobytes(report.totalBytes)}, `
        + `${report.packages.length} bundled packages`,
    );
    for (const violation of report.violations) {
      failed = true;
      console.error(`  violation: ${violation}`);
    }
  }
  if (failed) process.exitCode = 1;
}
