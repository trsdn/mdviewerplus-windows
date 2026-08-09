// Third-party provenance.
//
// Notices are derived from the packages that the edition build actually
// bundled, so a Lite artifact can never carry a Full-only notice and a Full
// artifact can never ship code without one.

import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { EDITION_LABELS, parseEdition } from './editions.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LICENSE_FILE_PATTERN = /^(licen[cs]e|copying|notice)(\.\w+)?$/i;

function packageDirectoryFor(inputPath) {
  const segments = inputPath.split('/');
  const lastModulesIndex = segments.lastIndexOf('node_modules');
  if (lastModulesIndex < 0) return null;

  const scoped = segments[lastModulesIndex + 1]?.startsWith('@');
  const end = lastModulesIndex + (scoped ? 3 : 2);
  if (segments.length < end) return null;
  return segments.slice(0, end).join('/');
}

async function readLicenseText(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return null;
  }
  const licenseFile = entries.find((entry) => entry.isFile() && LICENSE_FILE_PATTERN.test(entry.name));
  if (!licenseFile) return null;
  return (await readFile(path.join(directory, licenseFile.name), 'utf8')).trim();
}

function licenseIdentifier(manifest) {
  if (typeof manifest.license === 'string') return manifest.license;
  if (manifest.license && typeof manifest.license.type === 'string') return manifest.license.type;
  if (Array.isArray(manifest.licenses)) {
    return manifest.licenses.map((entry) => entry.type || entry).join(' OR ');
  }
  return 'UNKNOWN';
}

/** Collect every npm package whose files were bundled into the edition output. */
export async function collectBundledPackages(metafile) {
  const lock = JSON.parse(await readFile(path.join(repositoryRoot, 'package-lock.json'), 'utf8'));
  const directories = new Set();
  for (const inputPath of Object.keys(metafile.inputs)) {
    const directory = packageDirectoryFor(inputPath);
    if (directory) directories.add(directory);
  }

  const packages = [];
  for (const directory of [...directories].sort()) {
    const absolute = path.resolve(repositoryRoot, directory);
    let manifest;
    try {
      manifest = JSON.parse(await readFile(path.join(absolute, 'package.json'), 'utf8'));
    } catch {
      continue;
    }
    const lockEntry = lock.packages?.[directory] || {};
    packages.push({
      name: manifest.name,
      version: manifest.version,
      license: licenseIdentifier(manifest),
      homepage: manifest.homepage || manifest.repository?.url || '',
      source: lockEntry.resolved || manifest.repository?.url || manifest.homepage || '',
      checksum: lockEntry.integrity || 'not recorded',
      licenseText: await readLicenseText(absolute),
    });
  }

  return packages.sort((left, right) => left.name.localeCompare(right.name));
}

export async function writeThirdPartyNotices(edition, metafile, outputDirectory) {
  const label = EDITION_LABELS[parseEdition(edition)];
  const packages = await collectBundledPackages(metafile);

  const lines = [
    `# Third-party notices — MDViewer+ ${label} for Windows`,
    '',
    `This ${label} build bundles the packages listed below. Full license texts follow the summary.`,
    '',
    '| Package | Version | Source | License | Package checksum | Edition |',
    '|---|---|---|---|---|---|',
    ...packages.map((entry) => (
      `| ${entry.name} | ${entry.version} | ${entry.source || 'package manifest'} | `
        + `${entry.license} | ${entry.checksum} | ${label} |`
    )),
    '',
  ];

  for (const entry of packages) {
    lines.push(`## ${entry.name} ${entry.version}`, '', `License: ${entry.license}`, '');
    if (entry.homepage) lines.push(`Source: ${entry.homepage}`, '');
    lines.push(`Package checksum: ${entry.checksum}`, '');
    if (entry.licenseText) lines.push('```text', entry.licenseText, '```', '');
    else lines.push('The package did not include a standalone notice file; see its source for the license text.', '');
  }

  const contents = `${lines.join('\n').trimEnd()}\n`;
  await writeFile(path.join(outputDirectory, 'THIRD-PARTY-NOTICES.md'), contents, 'utf8');
  await writeFile(
    path.join(repositoryRoot, 'docs', `third-party-notices-${edition}.md`),
    contents,
    'utf8',
  );
  return packages;
}

/** Deterministic content digest of a package tarball's integrity entry. */
export async function readPackageLockIntegrity() {
  const lock = JSON.parse(await readFile(path.join(repositoryRoot, 'package-lock.json'), 'utf8'));
  const integrity = new Map();
  for (const [location, entry] of Object.entries(lock.packages || {})) {
    if (!location.startsWith('node_modules/') || !entry.version) continue;
    const name = location.slice(location.lastIndexOf('node_modules/') + 'node_modules/'.length);
    integrity.set(`${name}@${entry.version}`, entry.integrity || null);
  }
  return integrity;
}

export function digestOf(value) {
  return createHash('sha256').update(value).digest('hex');
}
