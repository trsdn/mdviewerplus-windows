// Menu event dispatcher — forwards Tauri menu events to app handlers

import { listen } from '@tauri-apps/api/event';

const handlers = {};

export function initShortcuts() {
  listen('menu-event', (event) => {
    const id = event.payload;
    if (handlers[id]) {
      handlers[id]();
    }
  });
}

export function onMenuEvent(id, handler) {
  handlers[id] = handler;
}
