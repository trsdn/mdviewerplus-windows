import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const IDENTIFIER = 'Trsdn.MDViewerPlus';
const MANIFEST_VERSION = '1.10.0';

function schemaHeader(type) {
  return `# yaml-language-server: $schema=https://aka.ms/winget-manifest.${type}.${MANIFEST_VERSION}.schema.json
`;
}

function assertInput(condition, message) {
  if (!condition) throw new Error(message);
}

export function renderWinGetManifests({ version, installerUrl, installerSha256 }) {
  assertInput(/^\d+\.\d+\.\d+$/.test(version), 'Version must be semantic x.y.z.');
  assertInput(
    /^https:\/\/github\.com\/trsdn\/mdviewerplus-windows\/releases\/download\/v\d+\.\d+\.\d+\/MDViewerPlus-Full-Windows-x64-Setup\.exe$/.test(installerUrl),
    'Installer URL must be the immutable Full NSIS GitHub release asset.',
  );
  assertInput(/^[A-F0-9]{64}$/.test(installerSha256), 'Installer SHA-256 must be 64 uppercase hex characters.');

  return {
    [`${IDENTIFIER}.yaml`]: `${schemaHeader('version')}
PackageIdentifier: ${IDENTIFIER}
PackageVersion: ${version}
DefaultLocale: en-US
ManifestType: version
ManifestVersion: ${MANIFEST_VERSION}
`,
    [`${IDENTIFIER}.installer.yaml`]: `${schemaHeader('installer')}
PackageIdentifier: ${IDENTIFIER}
PackageVersion: ${version}
InstallerType: nullsoft
Scope: user
UpgradeBehavior: install
FileExtensions:
  - md
  - markdown
  - mdown
  - mkd
Installers:
  - Architecture: x64
    InstallerUrl: ${installerUrl}
    InstallerSha256: ${installerSha256}
    InstallerSwitches:
      Silent: /S
      SilentWithProgress: /S
ManifestType: installer
ManifestVersion: ${MANIFEST_VERSION}
`,
    [`${IDENTIFIER}.locale.en-US.yaml`]: `${schemaHeader('defaultLocale')}
PackageIdentifier: ${IDENTIFIER}
PackageVersion: ${version}
PackageLocale: en-US
Publisher: Torsten Mahr
PublisherUrl: https://github.com/trsdn
PackageName: MDViewer+ for Windows
PackageUrl: https://github.com/trsdn/mdviewerplus-windows
License: MIT
ShortDescription: Offline Markdown viewer and editor for Windows
Description: MDViewer+ is an offline Markdown viewer and editor with live preview. The Full edition is the recommended installer.
Moniker: mdviewerplus
Tags:
  - markdown
  - editor
  - viewer
  - offline
ManifestType: defaultLocale
ManifestVersion: ${MANIFEST_VERSION}
`,
  };
}

function argument(name) {
  return process.argv.slice(2).find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const version = argument('version');
  const installer = argument('installer');
  const installerUrl = argument('url');
  const output = argument('output');
  assertInput(installer && output, 'Usage requires --installer and --output.');
  const installerSha256 = createHash('sha256')
    .update(await readFile(installer))
    .digest('hex')
    .toUpperCase();
  const manifests = renderWinGetManifests({ version, installerUrl, installerSha256 });
  await mkdir(output, { recursive: true });
  await Promise.all(
    Object.entries(manifests).map(([name, contents]) => writeFile(path.join(output, name), contents)),
  );
  console.log(`Prepared ${Object.keys(manifests).length} WinGet manifests in ${output}.`);
}
