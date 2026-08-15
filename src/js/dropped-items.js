// Pure classification of a webview drop into the items MDViewer+ can act on.

const MARKDOWN_EXTENSIONS = Object.freeze(['markdown', 'md', 'mdown', 'mkd']);

function extensionOf(path) {
  const name = path.split(/[\\/]/).pop() ?? '';
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export function isMarkdownPath(path) {
  return MARKDOWN_EXTENSIONS.includes(extensionOf(path));
}

export function basename(path) {
  const name = path.split(/[\\/]/).filter(Boolean).pop();
  return name ?? path;
}

/**
 * Splits classified drop entries into Markdown files, folders and the rest.
 *
 * `entries` are `{ path, kind }` records from `classify_dropped_paths`, where
 * `kind` is `directory`, `file` or `missing`. Duplicates are removed and the
 * drop order is preserved.
 */
export function classifyDropped(entries) {
  const markdownFiles = [];
  const folders = [];
  const unsupported = [];
  const seen = new Set();

  for (const entry of entries ?? []) {
    const path = entry?.path;
    if (typeof path !== 'string' || path.length === 0) continue;
    if (seen.has(path)) continue;
    seen.add(path);

    if (entry.kind === 'directory') {
      folders.push(path);
    } else if (entry.kind === 'file' && isMarkdownPath(path)) {
      markdownFiles.push(path);
    } else {
      unsupported.push(path);
    }
  }

  return { markdownFiles, folders, unsupported };
}

/** Explains why a drop was rejected. */
export function rejectionMessage(unsupported) {
  const extensions = MARKDOWN_EXTENSIONS.map((value) => `.${value}`).join(', ');
  const items = unsupported ?? [];

  if (items.length === 0) {
    return `Drop a Markdown file (${extensions}) or a folder.`;
  }

  if (items.length === 1) {
    return `"${basename(items[0])}" is not a Markdown file. `
      + `Drop a Markdown file (${extensions}) or a folder.`;
  }

  return `None of the ${items.length} dropped items is a Markdown file. `
    + `Drop a Markdown file (${extensions}) or a folder.`;
}

/** Message shown when a drop carried more documents than one window can show. */
export function extraDocumentsMessage(markdownFiles) {
  const remaining = (markdownFiles?.length ?? 0) - 1;
  if (remaining < 1) return '';
  return `Opened "${basename(markdownFiles[0])}". `
    + `MDViewer+ shows one document per window, so ${remaining} other `
    + `${remaining === 1 ? 'file was' : 'files were'} not opened.`;
}
