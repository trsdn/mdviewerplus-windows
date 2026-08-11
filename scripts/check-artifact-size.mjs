import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function exceedsSizeLimit(current, baseline) {
  const increase = current - baseline;
  return increase > 512 * 1024 && increase * 100 > baseline * 2;
}

export async function checkArtifactSize(baselineKey, artifactPath) {
  const baselines = JSON.parse(
    await readFile(path.join(root, 'config/artifact-size-baselines.json'), 'utf8'),
  );
  const record = baselines[baselineKey];
  if (!record) throw new Error(`Unknown artifact size baseline: ${baselineKey}`);

  const current = (await stat(artifactPath)).size;
  const increase = current - record.bytes;
  const percent = (increase * 100) / record.bytes;
  console.log(
    `Lite ${record.packageFormat} size: ${current} bytes; v2.0.1 baseline: `
      + `${record.bytes} bytes; change: ${increase >= 0 ? '+' : ''}${increase} bytes `
      + `(${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%).`,
  );
  if (exceedsSizeLimit(current, record.bytes)) {
    throw new Error('Artifact size increase exceeds both 524288 bytes and 2%.');
  }
  return { current, baseline: record.bytes };
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [, , baselineKey, artifactPath] = process.argv;
  if (!baselineKey || !artifactPath) {
    console.error('Usage: node scripts/check-artifact-size.mjs <baseline-key> <artifact>');
    process.exitCode = 2;
  } else {
    await checkArtifactSize(baselineKey, artifactPath);
  }
}
