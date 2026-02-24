# MDViewer+ for Windows

A fast, native Markdown viewer and editor built with **Tauri v2** and **CodeMirror 6**.

## Features

- **Split View** -- Editor and preview side by side
- **Toggle View Modes** -- Switch between view, split, and edit (`Ctrl+E`)
- **GitHub Flavored Markdown** -- Full GFM support via `marked.js`
- **Dark / Light / System Theme** -- Automatic or manual theme switching
- **Zoom** -- Independent zoom for editor and preview
- **File Associations** -- Open `.md` files directly from Explorer

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+O` | Open file |
| `Ctrl+S` | Save |
| `Ctrl+Shift+S` | Save As |
| `Ctrl+E` | Toggle view mode |
| `Ctrl+F` | Find |
| `Ctrl+B` | **Bold** |
| `Ctrl+I` | *Italic* |
| `Ctrl+K` | [Link]() |
| `Ctrl++` | Zoom in |
| `Ctrl+-` | Zoom out |
| `Ctrl+0` | Reset zoom |

## Markdown Examples

### Text Formatting

This is **bold text** and this is *italic text*. You can also use ~~strikethrough~~ and `inline code`.

> This is a blockquote. It can span
> multiple lines and contains *formatted* text.

### Lists

Unordered list:

- First item
- Second item
  - Nested item A
  - Nested item B
- Third item

Ordered list:

1. Step one
2. Step two
3. Step three

### Task List

- [x] Create Tauri project
- [x] Implement editor with CodeMirror
- [x] Add Markdown preview
- [ ] Add syntax highlighting for code blocks
- [ ] Export to PDF

### Code Blocks

JavaScript:

```javascript
async function openFile(filePath) {
  const contents = await invoke('read_file', { path: filePath });
  setContent(contents);
  renderMarkdown(contents);
}
```

Rust:

```rust
#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file: {}", e))
}
```

### Table

| Component | Technology | Purpose |
|---|---|---|
| Frontend | HTML/CSS/JS | UI rendering |
| Editor | CodeMirror 6 | Text editing |
| Preview | marked.js | Markdown to HTML |
| Backend | Tauri v2 / Rust | Native APIs |
| Bundler | esbuild | JS bundling |

### Links

- [Tauri Documentation](https://v2.tauri.app)
- [CodeMirror](https://codemirror.net)
- [marked.js](https://marked.js.org)

### Horizontal Rule

---

### Image Test

If you place an image named `screenshot.png` next to this file, it will render below:

![Screenshot](screenshot.png)

## Architecture

```
mdviewerplus-windows/
  src/
    js/
      main.js          -- App orchestrator
      editor.js        -- CodeMirror setup
      preview.js       -- Markdown rendering
      shortcuts.js     -- Keyboard shortcuts
      split-pane.js    -- Draggable splitter
      theme.js         -- Theme management
      zoom.js          -- Zoom controls
  src-tauri/
    src/
      lib.rs           -- Tauri app setup
      main.rs          -- Entry point
      menu.rs          -- Native menu
      commands.rs      -- Tauri commands
  dist/
    index.html         -- Main HTML
    styles/            -- CSS files
    bundle.js          -- Built JS bundle
```

## Build & Run

```bash
npm install
npm run dev        # Development mode
npm run build      # Production build
```

---

*Built with Tauri v2 -- MDViewer+ 1.0.0*
