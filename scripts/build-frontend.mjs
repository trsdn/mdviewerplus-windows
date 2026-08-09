// Edition-aware frontend build.
//
// Both editions are produced from the same sources. The edition only selects
// which capability module `#edition` resolves to, so Full-only packages are
// physically unreachable from a Lite build and never reach its output folder.

import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { editionConditions, editionFromArgv, EDITION_LABELS } from './editions.mjs';
import { writeThirdPartyNotices } from './third-party.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function buildFrontend(edition, { minify = process.env.NODE_ENV !== 'development' } = {}) {
  const outputDirectory = path.join(repositoryRoot, 'dist', edition);
  const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, 'package.json'), 'utf8'));

  // A clean directory is what makes "physically excluded" verifiable.
  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });
  await cp(path.join(repositoryRoot, 'src', 'web'), outputDirectory, { recursive: true });

  const result = await build({
    entryPoints: [{ in: path.join(repositoryRoot, 'src', 'js', 'main.js'), out: 'bundle' }],
    bundle: true,
    outdir: outputDirectory,
    format: 'esm',
    target: 'es2022',
    splitting: true,
    chunkNames: 'chunks/[name]-[hash]',
    conditions: editionConditions(edition),
    define: {
      __MDVIEWER_EDITION__: JSON.stringify(edition),
      __MDVIEWER_VERSION__: JSON.stringify(packageJson.version),
    },
    minify,
    sourcemap: false,
    legalComments: 'none',
    metafile: true,
    logLevel: 'warning',
  });

  await writeFile(
    path.join(repositoryRoot, 'dist', `metafile-${edition}.json`),
    JSON.stringify(result.metafile, null, 2),
  );
  const notices = await writeThirdPartyNotices(edition, result.metafile, outputDirectory);

  return { edition, outputDirectory, metafile: result.metafile, notices };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const edition = editionFromArgv(process.argv.slice(2));
  const { outputDirectory, notices } = await buildFrontend(edition);
  console.log(
    `${EDITION_LABELS[edition]} frontend build complete: ${path.relative(repositoryRoot, outputDirectory)} `
      + `(${notices.length} third-party packages).`,
  );
}
