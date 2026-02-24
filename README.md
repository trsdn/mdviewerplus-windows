# MDViewer+ for Windows

The Windows port of [MDViewer+](https://github.com/trsdn/mdviewerplus) -- a minimal Markdown editor and viewer. Clean rendering, inline editing, and live preview -- no bloat.

![Windows](https://img.shields.io/badge/Windows-10%2F11-0078D4?logo=windows&logoColor=white)
![Tauri](https://img.shields.io/badge/Tauri-v2-FFC131?logo=tauri&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue)

## Features

- **Three view modes** -- view-only, split (editor + preview), and edit-only, cycled with `Ctrl+E`
- **Live preview** -- edits render instantly in the side-by-side split view
- **Scroll sync** -- bidirectional scroll synchronization between editor and preview
- **Markdown formatting** -- Bold (`Ctrl+B`), Italic (`Ctrl+I`), Link (`Ctrl+K`)
- **GitHub-flavored rendering** via [marked.js](https://marked.js.org)
- **Dark mode** -- automatic (system), light, or dark via View > Appearance
- **Context-aware zoom** -- `Ctrl+`/`Ctrl-` targets the active pane
- **File associations** -- open `.md` files directly from Explorer
- **Native file handling** -- Open, Save, Save As, Reload

## Install

Download the latest installer from [Releases](https://github.com/trsdn/mdviewerplus-windows/releases) or build from source:

### Prerequisites

- [Node.js](https://nodejs.org) (v18+)
- [Rust](https://rustup.rs)
- [Visual Studio Build Tools 2022](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with C++ workload

### Build

```bash
npm install
npm run build
```

The installer (NSIS + MSI) will be in `src-tauri/target/release/bundle/`.

### Development

```bash
npm run dev
```

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
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
|---------|---------|
| [Tauri v2](https://v2.tauri.app) | Native window, menus, file system |
| [CodeMirror 6](https://codemirror.net) | Markdown editor |
| [marked](https://github.com/markedjs/marked) | Markdown to HTML |
| [esbuild](https://esbuild.github.io) | JS bundling |

## License

[MIT](LICENSE)
