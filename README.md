# MDViewer+ for Windows

The Windows port of [MDViewer+](https://github.com/trsdn/mdviewerplus) — a minimal Markdown editor and viewer with clean rendering, inline editing, and live preview.

![Windows](https://img.shields.io/badge/Windows-10%2F11-0078D4?logo=windows&logoColor=white)
![Tauri](https://img.shields.io/badge/Tauri-v2-FFC131?logo=tauri&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue)

## Features

- **Three view modes** — view-only, split (editor + preview), and edit-only, cycled with `Ctrl+E`
- **Live preview** — edits render instantly in the side-by-side split view
- **Scroll sync** — bidirectional scroll synchronization between editor and preview
- **Markdown formatting** — Bold (`Ctrl+B`), Italic (`Ctrl+I`), Link (`Ctrl+K`)
- **GitHub-flavored rendering** via [marked.js](https://marked.js.org)
- **Curated themes** — System, Light, or Dark appearance with separate trusted palette choices
- **Context-aware zoom** — `Ctrl+`/`Ctrl-` targets the active pane
- **File associations** — open `.md` files directly from Explorer
- **Native file handling** — Open, Save, Save As, Reload

## Appearance and palettes

Open **View > Appearance > Theme Settings…** to select an appearance mode and preferred light and dark palettes. System mode follows the Windows appearance and switches between your selected palettes automatically. Invalid settings safely fall back to GitHub Light or GitHub Dark.

| Light palettes | Background | Text | Link | Code text | Code background |
|---|---:|---:|---:|---:|---:|
| GitHub Light | `#ffffff` | `#24292f` | `#0969da` | `#24292f` | `#f6f8fa` |
| Solarized Light | `#fdf6e3` | `#586e75` | `#006da8` | `#566c73` | `#eee8d5` |
| Sepia | `#f4ecd8` | `#3e3629` | `#765200` | `#3e3629` | `#e8dcc0` |

| Dark palettes | Background | Text | Link | Code text | Code background |
|---|---:|---:|---:|---:|---:|
| GitHub Dark | `#0d1117` | `#e6edf3` | `#58a6ff` | `#e6edf3` | `#161b22` |
| Solarized Dark | `#002b36` | `#839496` | `#3aaed8` | `#93a1a1` | `#073642` |
| Dracula | `#282a36` | `#f8f8f2` | `#bd93f9` | `#f8f8f2` | `#44475a` |
| Monokai | `#272822` | `#f8f8f2` | `#66d9ef` | `#f8f8f2` | `#3e3d32` |
| Nord | `#2e3440` | `#eceff4` | `#88c0d0` | `#e5e9f0` | `#3b4252` |

The selected palette consistently styles the app, editor, preview, syntax, selection, caret, search, gutters, and splitter. Sepia is a light palette selected in Settings; it has no dedicated shortcut.

## Install

Download the latest unsigned installer from [Releases](https://github.com/trsdn/mdviewerplus-windows/releases) or build from source. Release downloads include separate SHA-256 checksum files. This project does not currently claim code signing.

### Prerequisites

- [Node.js](https://nodejs.org) (v18+)
- [Rust](https://rustup.rs)
- [Visual Studio Build Tools 2022](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with C++ workload

### Build

```bash
npm install
npm test
npm run build
```

The NSIS and MSI installers will be in `src-tauri/target/release/bundle/`.

### Development

```bash
npm run dev
```

## Keyboard Shortcuts

The appearance shortcuts are unchanged. They select the mode while retaining the preferred light and dark palettes.

| Action | Shortcut |
|---|---|
| Toggle View Mode | `Ctrl+E` |
| Open | `Ctrl+O` |
| Save | `Ctrl+S` |
| Save As | `Ctrl+Shift+S` |
| Reload | `Ctrl+R` |
| Find | `Ctrl+F` |
| Bold | `Ctrl+B` |
| Italic | `Ctrl+I` |
| Link | `Ctrl+K` |
| Zoom In | `Ctrl++` |
| Zoom Out | `Ctrl+-` |
| Actual Size | `Ctrl+0` |
| System Appearance | `Ctrl+Shift+0` |
| Light Mode | `Ctrl+Shift+1` |
| Dark Mode | `Ctrl+Shift+2` |

## Dependencies

| Library | Purpose |
|---|---|
| [Tauri v2](https://v2.tauri.app) | Native window, menus, file system |
| [CodeMirror 6](https://codemirror.net) | Markdown editor |
| [marked](https://github.com/markedjs/marked) | Markdown to HTML |
| [esbuild](https://esbuild.github.io) | JavaScript bundling |

## License

[MIT](LICENSE)
