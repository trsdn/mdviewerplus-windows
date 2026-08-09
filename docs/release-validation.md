# Release validation

## Automated on macOS or Windows

- Clean Lite and Full frontend builds
- DOMPurify/URL/SVG/CSP hostile fixtures
- Markdown feature and document-operation tests
- Full YAML/highlight/Mermaid policy tests
- Physical Lite exclusion and Full lazy-entry artifact audits
- Exact dependency versions, sources, integrity checksums, licenses, notices
- Rust traversal, encoded traversal, symlink, extension, and resource tests
- Rust format and Clippy checks

## Windows-only gates

The release workflow must pass these on `windows-latest` before publishing:

- Native WebView2 launch and rendering
- Non-recursive watcher delivery, debounce, teardown, stale-generation rejection,
  and negligible idle CPU
- Lite and Full NSIS/MSI creation from the same commit and version
- Lite-to-Full and Full-to-Lite replacement for NSIS and MSI
- Install/uninstall and Markdown file associations
- Distinct installer names and per-file SHA-256 verification
- Cold launch, initial render, live typing, large document, search, outline,
  Mermaid render, memory, app size, installer size, and compressed delta
- Full ordinary-document startup without loading Full chunks
- Unsigned SmartScreen disclosure
- Generated WinGet manifest validation against the immutable Full NSIS asset

The repository does not claim those Windows-only checks were executed on macOS.
The checked-in WinGet checksum remains a placeholder until a real release asset
is approved; the preparation workflow replaces it and uploads, but never
submits, the validated manifests.
