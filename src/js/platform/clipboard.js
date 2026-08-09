// Narrow clipboard path.
//
// No Tauri capability and no UI dependency: a detached textarea plus the
// synchronous copy command, with the asynchronous clipboard API used only when
// the WebView exposes it in a secure context.

export const MAX_CLIPBOARD_CHARACTERS = 2 * 1024 * 1024;

export function isCopyableText(text) {
  return typeof text === 'string' && text.length > 0 && text.length <= MAX_CLIPBOARD_CHARACTERS;
}

function copyWithSelection(text) {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.setAttribute('aria-hidden', 'true');
  area.style.position = 'fixed';
  area.style.top = '-1000px';
  area.style.opacity = '0';
  document.body.appendChild(area);

  const selection = document.getSelection();
  const previousRanges = selection ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index)) : [];

  try {
    area.select();
    area.setSelectionRange(0, text.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
    if (selection) {
      selection.removeAllRanges();
      for (const range of previousRanges) selection.addRange(range);
    }
  }
}

/** Copy plain text. Returns false instead of throwing so callers can report. */
export async function copyText(text) {
  if (!isCopyableText(text)) return false;

  if (copyWithSelection(text)) return true;

  const clipboard = globalThis.navigator?.clipboard;
  if (clipboard && typeof clipboard.writeText === 'function') {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  return false;
}
