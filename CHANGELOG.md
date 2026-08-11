# Changelog

## 2.1.0

- Added an optional, read-only Folder Navigator to Lite and Full.
- Added lazy, bounded folder expansion, current-document reveal, loaded-folder
  refresh, accessible tree keyboard controls, and persisted visibility and width.
- Added **File > Open Folder…**, **View > Folder Navigator**, and
  `Ctrl+Shift+B` while preserving Quick Open, outline, and dirty-safe opening.

## 2.0.1

- Added accessible in-app Help and About surfaces with edition/version details,
  keyboard guidance, project links, issue reporting, and copyright information.
- Added a GitHub Pages support page and refreshed project documentation.
- Retained ordered MSI revisions for cross-edition replacement.

## 2.0.0

- Added Full and Lite editions from one shared source tree and product identity.
- Added DOMPurify-before-insertion rendering, a strict CSP, restrictive Mermaid
  SVG sanitization, confined native resource commands, and narrow capabilities.
- Added serialized internal Markdown links, current-folder Quick Open, a
  debounced native watcher, focus-aware Find, and a searchable document outline.
- Added footnotes, GitHub alerts, read-only task lists, local image inspection,
  and accessible code-block controls.
- Added a <=10 KiB custom Lite Prism chunk for the documented language set.
- Added lazy Full highlight.js, restricted YAML frontmatter cards, complete
  offline Mermaid ESM rendering, and post-render svg-pan-zoom.
- Added dual-edition artifact audits, package provenance/notices, Node/Rust
  security tests, and release-ready Lite/Full NSIS/MSI automation.
- Prepared but did not submit proposed `Trsdn.MDViewerPlus` WinGet manifests.
- Preserved the explicit unsigned-installer disclosure and per-asset checksums.

Several of this release's lightweight power features (footnotes, custom Prism
highlighting, GitHub alerts/task lists, document outline, folder watcher) and
the Full Mermaid rendering work were informed by
[sdkks/mdviewer](https://github.com/sdkks/mdviewer) and
[jnscnn/mdviewer-plus-plus](https://github.com/jnscnn/mdviewer-plus-plus).
Thanks to @sdkks and @jnscnn for the implementation input.

## 1.2.0

- Added `Ctrl+N` New File with untitled-document Save As behavior.
- Added explicit dirty tracking and confirmation before discarding changes through New, Open, Reload, sibling navigation, file-association/CLI opens, or window close.
- Added deterministic Previous/Next Markdown File navigation with `Ctrl+Alt+Left` and `Ctrl+Alt+Right`.
- Added user-visible file operation errors and automated frontend/Rust navigation policy tests.

Sibling navigation was informed by [sdkks/mdviewer](https://github.com/sdkks/mdviewer). Thanks to @sdkks for the downstream implementation input and @sakkas-zendesk for the original request.

## 1.1.0

- Added System, Light, and Dark appearance settings with separate preferred palettes.
- Added GitHub Light, Solarized Light, Sepia, GitHub Dark, Solarized Dark, Dracula, Monokai, and Nord.
- Unified app, CodeMirror, preview, splitter, search, selection, and caret colors through trusted semantic theme variables.
- Added backward-compatible theme persistence and automated frontend/Rust compatibility tests.
- Added an unsigned Windows tag-release workflow for NSIS/MSI installers and SHA-256 files.

Thanks to [@asherweintraub](https://github.com/asherweintraub) and the [asherweintraub/mdviewer fork](https://github.com/asherweintraub/mdviewer) for the theme/settings inspiration, and to [@ulfendk](https://github.com/ulfendk) and the [ulfendk/mdviewer fork](https://github.com/ulfendk/mdviewer) for the Sepia inspiration.
