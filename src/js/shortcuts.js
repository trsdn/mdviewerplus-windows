// Menu event dispatcher — forwards Tauri menu events to app handlers
// Also registers direct keyboard shortcuts as fallback

import { listen } from '@tauri-apps/api/event';

const handlers = {};

// Direct keyboard shortcuts (fallback if menu accelerators don't fire events)
const keyboardShortcuts = {
  'ctrl+n': 'new',
  'ctrl+e': 'toggle_edit_mode',
  'ctrl+o': 'open',
  'ctrl+s': 'save',
  'ctrl+shift+s': 'save_as',
  'ctrl+r': 'reload',
  'ctrl+alt+arrowleft': 'previous_file',
  'ctrl+alt+arrowright': 'next_file',
  'ctrl+k': 'quick_open',
  'ctrl+shift+o': 'outline',
  'ctrl+f': 'find',
  'f3': 'find_next',
  'shift+f3': 'find_previous',
  'ctrl+b': 'format_bold',
  'ctrl+i': 'format_italic',
  'ctrl+shift+k': 'format_link',
  'ctrl+p': 'print',
  'ctrl+=': 'zoom_in',
  'ctrl+-': 'zoom_out',
  'ctrl+0': 'zoom_reset',
  'ctrl+shift+0': 'theme_system',
  'ctrl+shift+1': 'theme_light',
  'ctrl+shift+2': 'theme_dark',
  'f1': 'help',
};

export function initShortcuts() {
  // Listen for Tauri menu events
  listen('menu-event', (event) => {
    const id = event.payload;
    if (handlers[id]) {
      handlers[id]();
    }
  });

  // Direct keyboard shortcut fallback
  document.addEventListener('keydown', (e) => {
    const parts = [];
    if (e.ctrlKey || e.metaKey) parts.push('ctrl');
    if (e.shiftKey) parts.push('shift');
    if (e.altKey) parts.push('alt');
    parts.push(e.key.toLowerCase());
    const combo = parts.join('+');

    const actionId = keyboardShortcuts[combo];
    if (actionId && handlers[actionId]) {
      e.preventDefault();
      handlers[actionId]();
    }
  });
}

export function onMenuEvent(id, handler) {
  handlers[id] = handler;
}
