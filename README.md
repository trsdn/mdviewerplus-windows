# MDViewer+ for Windows

An offline Markdown viewer and editor for Windows 10/11, built with Tauri 2,
CodeMirror 6, and one shared Lite/Full source tree.

## Editions

**Full is the recommended download.** Lite is for users who want the smallest
installer and only the explicitly selected preview languages.

| Capability | Lite | Full |
|---|---:|---:|
| Editing, live preview, themes, printing | Yes | Yes |
| Focus-aware Find, current-folder Quick Open, outline | Yes | Yes |
| Secure internal Markdown links and native folder refresh | Yes | Yes |
| Footnotes, GitHub alerts, task lists | Yes | Yes |
| Image inspection and code-block controls | Yes | Yes |
| Preview highlighting | Custom Prism: Bash, CSS, HTML, JavaScript/TypeScript, JSON, Python, Rust, Swift | Lazy highlight.js broad language set |
| YAML frontmatter cards | No | Lazy, restricted js-yaml |
| Mermaid with pan/zoom | No | Lazy, complete offline Mermaid ESM |

Both editions use the same product identity, executable, installation directory,
and Markdown file associations. Installing or repairing one edition replaces
the other. **Help > About MDViewer+** identifies the installed edition and version.

## Features

- View, split, and edit modes
- Live preview with bidirectional scroll synchronization
- Serialized, dirty-safe New/Open/Reload/navigation/internal-link operations
- Current-folder sibling navigation, Quick Open, and native event refresh
- Editor CodeMirror search and dependency-free preview search
- Searchable transient document outline with duplicate/Unicode heading anchors
- GFM tables, task lists, alerts, and accessible footnotes
- Local-only raster image loading with zoom, pan, fit, and actual-size inspection
- Preview code labels, exact-source Copy, wrapping, and bounded line numbers
- System/light/dark appearance with curated semantic palettes
- Full-only lazy Mermaid, svg-pan-zoom, highlight.js, and YAML metadata

## Security model

- Marked output is sanitized by pinned DOMPurify **before** preview insertion.
- Mermaid SVG uses a separate restrictive SVG sanitizer. Scripts, event
  handlers, `foreignObject`, navigation, external resources, unsafe CSS URLs,
  animation, and embedded content are removed.
- CSP allows self-hosted scripts only; connections, frames, objects, base
  navigation, forms, workers, and media are disabled.
- No CDN, runtime download, remote image, `eval`, or inline script is used.
- Tauri exposes no broad filesystem or shell capability. Native commands
  validate Markdown extensions, URL schemes, canonical paths, file types,
  resource sizes, traversal, encoded traversal, and symlink escapes.
- Local images are read as bounded raster bytes and displayed through revocable
  blob URLs. SVG files are not accepted as Markdown image resources.
- Folder watchers are non-recursive, debounced, generation-checked, and stopped
  when the document changes or the window closes.

See [docs/security.md](docs/security.md) for the detailed trust boundaries.

## Keyboard shortcuts

| Action | Shortcut |
|---|---|
| New | `Ctrl+N` |
| Open | `Ctrl+O` |
| Quick Open current folder | `Ctrl+K` |
| Save / Save As | `Ctrl+S` / `Ctrl+Shift+S` |
| Reload | `Ctrl+R` |
| Previous / next Markdown file | `Ctrl+Alt+Left` / `Ctrl+Alt+Right` |
| Find / next / previous | `Ctrl+F` / `F3` / `Shift+F3` |
| Document outline | `Ctrl+Shift+O` |
| Bold / italic / format link | `Ctrl+B` / `Ctrl+I` / `Ctrl+Shift+K` |
| Toggle view mode | `Ctrl+E` |
| Print | `Ctrl+P` |
| Zoom in / out / reset | `Ctrl++` / `Ctrl+-` / `Ctrl+0` |
| System / light / dark appearance | `Ctrl+Shift+0` / `Ctrl+Shift+1` / `Ctrl+Shift+2` |

## Install

Release assets are named:

- `MDViewerPlus-Full-Windows-x64-Setup.exe`
- `MDViewerPlus-Full-Windows-x64.msi`
- `MDViewerPlus-Lite-Windows-x64-Setup.exe`
- `MDViewerPlus-Lite-Windows-x64.msi`
- one `.sha256` file per installer
- edition-specific third-party notices

### Unsigned installer disclosure

The installers are currently **unsigned**. Windows may show a SmartScreen
warning. Download only from this repository's Releases page and verify the
attached SHA-256 file. The project does not claim Authenticode signing.

## Build and test

Requirements: Node.js 22.22.2+, stable Rust, and on Windows Visual Studio Build
Tools 2022 with the C++ workload.

```bash
npm ci
npm test
cargo test --manifest-path src-tauri/Cargo.toml --locked
```

`npm test` clean-builds, audits, and tests both editions. Individual frontend
commands are:

```bash
npm run build:frontend:lite
npm run build:frontend:full
npm run audit:artifacts
npm run measure:builds
```

Windows installer builds:

```powershell
npm run build:installer:lite
npm run build:installer:full
```

The installer outputs use isolated
`src-tauri/target/{lite,full}/release/bundle/` directories.

## Dependency membership

| Dependency | Common | Lite | Full |
|---|---:|---:|---:|
| CodeMirror, marked, marked-footnote, DOMPurify | Yes | Yes | Yes |
| Prism core plus project grammars | No | Yes | No |
| highlight.js | No | No | Lazy |
| js-yaml | No | No | Lazy |
| Mermaid official modular ESM | No | No | Lazy |
| svg-pan-zoom | No | No | After successful Mermaid render |

Exact versions, package sources, integrity checksums, licenses, and included
license texts are generated in
[`docs/third-party-notices-lite.md`](docs/third-party-notices-lite.md) and
[`docs/third-party-notices-full.md`](docs/third-party-notices-full.md).

## Size and validation

[`docs/build-metrics.json`](docs/build-metrics.json) records deterministic
minified web-asset measurements. The custom Lite Prism chunk is constrained to
10 KiB; DOMPurify is retained despite the lightweight feature budget because it
is a mandatory security boundary. Windows-only installer, WebView2 performance,
idle watcher, and cross-edition replacement checks are listed in
[docs/release-validation.md](docs/release-validation.md) and automated by the
release workflow where feasible.

Measurements from the current 2.0.0 source:

| Minified output | Lite | Full |
|---|---:|---:|
| Initial JavaScript entry | 626.1 KiB | 626.3 KiB |
| All lazy-capable JavaScript | 667.2 KiB | 4,228.1 KiB |
| All web assets and notices | 740.8 KiB | 4,386.7 KiB |
| Lite Prism chunk | 9.9 KiB | Not included |

The 0.2 KiB initial-entry difference demonstrates that ordinary Full documents
do not eagerly include Full-only renderer packages.

## WinGet status

Proposed `Trsdn.MDViewerPlus` manifests are prepared under
`packaging/winget/`. Only the Full x64 current-user NSIS installer is eligible.
The checked-in SHA-256 is an explicit pre-release placeholder; the manually
approved workflow downloads the immutable release asset, writes its real hash,
and runs `winget validate`. It uploads manifests as an artifact only. It does
not submit to `microsoft/winget-pkgs`.

## License

MIT.
