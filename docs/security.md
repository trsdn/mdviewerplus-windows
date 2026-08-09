# Security model

## Trust boundaries

1. Markdown is parsed by marked.
2. The complete HTML string is passed through the Markdown DOMPurify policy.
3. Only the returned DOM fragment is inserted.
4. Trusted postprocessors build alerts, tasks, headings, controls, image
   placeholders, and metadata cards through DOM APIs.
5. Highlighter markup is sanitized to `span` elements with bounded class names.
6. Mermaid reads only sanitized `pre > code.language-mermaid` text content.
7. Generated Mermaid SVG passes through a separate SVG-only DOMPurify policy.

The Markdown policy never accepts SVG. The SVG policy rejects script, handlers,
`foreignObject`, navigation, external references, embedded resources,
animation, filters that can fetch resources, and unsafe CSS URLs.

## Native resources

Frontend filesystem and shell capabilities are absent. Custom Rust commands:

- accept only supported Markdown or raster image extensions;
- canonicalize the current file, containing folder, and requested target;
- reject absolute, drive-relative, UNC, query, traversal, encoded separator,
  malformed encoding, directory, unsupported type, and symlink-escape targets;
- bound Markdown and image sizes;
- permit external opening only for parsed HTTP, HTTPS, and mailto URLs.

Local images are returned as base64 bytes, converted to blob URLs, and revoked
on rerender. SVG images are intentionally unsupported.

## Asynchronous safety

Document identity changes run through one promise queue. Dirty confirmation is
repeated if editing occurs while a target read is pending. Preview generations
discard stale image, frontmatter, highlighter, and diagram results. Folder
watcher events carry a generation and cannot refresh a later folder snapshot.
Watchers are non-recursive, debounced, and explicitly stopped during document
changes and approved window close.

## CSP

Scripts are self-only. Remote connections, frames, objects, workers, media,
base navigation, and form submission are disabled. Inline scripts, remote code,
runtime package downloads, and `eval` are not used.

## Dependency advisory note

As of 2026-08-09, `npm audit` reports two moderate advisories with no patched
release available yet at the pinned or latest published version:

- DOMPurify `GHSA-55q2-fjhq-7xh7`: the affected `IN_PLACE` hook-removal mode is
  never enabled anywhere in this application; sanitization always returns a
  new fragment (`RETURN_DOM_FRAGMENT: true`), so the reported subtree-reuse
  path is not reachable.
- Mermaid `GHSA-6x64-9x62-f2gx`, `GHSA-3rrr-jr9j-h3q3`, `GHSA-2v8p-3f2j-5mp7`,
  `GHSA-rhh3-jpg6-66xh`, `GHSA-c4c3-pg64-4m4v` (fixed upstream at `>=11.16.1`,
  not yet published on npm at audit time): Mermaid is initialized only from
  hardcoded security options and trusted built-in palette variables — no
  user- or document-derived data ever reaches `mermaid.initialize`, so the
  reported prototype-pollution config APIs are not reachable. Diagram source
  text is bounded
  (`MERMAID_LIMITS.maxSourceCharacters`), diagram count is bounded
  (`MERMAID_LIMITS.maxDiagrams`), concurrency is bounded
  (`MERMAID_LIMITS.maxConcurrent`), and each render is raced against a
  `MERMAID_LIMITS.timeoutMilliseconds` deadline that surfaces a visible error
  instead of hanging the pane. Rendered SVG output is always re-sanitized by
  the separate SVG-only DOMPurify policy before insertion, independent of
  Mermaid's own escaping.

`npm audit fix --force` only offers a `mermaid@10.9.6` downgrade, which is a
breaking major-version change to the ESM rendering API this edition depends on
and would remove the pinned, tested Full diagram feature; it is intentionally
not applied. This note will be revisited (and the pins bumped) once patched
`dompurify`/`mermaid` releases exist. High-severity audit findings remain
release-blocking; these moderate findings are tracked and mitigated as above.
