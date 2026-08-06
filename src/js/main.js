// Main orchestrator: init, menu events, file open, state management

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';

import { initEditor, setContent, getContent, setFontSize, formatBold, formatItalic, formatLink, openFind, getEditorView, getEditorElement } from './editor.js';
import { initPreview, renderMarkdown, setBaseDir, getPreviewPane } from './preview.js';
import { initSplitPane } from './split-pane.js';
import { initShortcuts, onMenuEvent } from './shortcuts.js';
import { initTheme, setTheme, setThemeSettings, getThemeSettings } from './theme.js';
import { initAppearanceSettings, openAppearanceSettings } from './appearance-settings.js';
import { initZoom, zoomIn, zoomOut, zoomReset, setActivePane, getPreviewZoom, getEditorFontSize, getActivePane } from './zoom.js';

// App state
let currentFilePath = null;
let viewMode = 'view';
const viewModes = ['view', 'split', 'edit'];

// Scroll sync
let isSyncing = false;

async function init() {
  // Load saved settings
  let settings;
  try {
    settings = await invoke('get_settings');
  } catch {
    settings = {
      appearance: 'system',
      light_theme: 'github-light',
      dark_theme: 'github-dark',
      zoom_level: 1.0,
      editor_font_size: 14.0,
      view_mode: 'view',
    };
  }

  // Init theme
  initTheme(settings);
  initAppearanceSettings((themeSettings) => {
    setThemeSettings(themeSettings);
    saveSettings();
  });

  // Init zoom
  initZoom(settings.zoom_level, settings.editor_font_size, (zoomState) => {
    if (zoomState.activePane === 'editor') {
      setFontSize(zoomState.editorFontSize);
    }
    saveSettings();
  });

  // Set initial view mode
  viewMode = settings.view_mode || 'split';
  document.body.setAttribute('data-view-mode', viewMode);

  // Init editor
  const editorContainer = document.getElementById('editor');
  initEditor(editorContainer, (text) => {
    renderMarkdown(text);
  });
  setFontSize(settings.editor_font_size);

  // Init preview
  initPreview();

  // Init split pane
  initSplitPane();

  // Init shortcuts
  initShortcuts();

  // Track active pane
  const editorEl = getEditorElement();
  const previewPane = getPreviewPane();

  editorEl.addEventListener('focusin', () => setActivePane('editor'));
  previewPane.addEventListener('focusin', () => setActivePane('preview'));
  previewPane.addEventListener('mousedown', () => setActivePane('preview'));
  editorEl.addEventListener('mousedown', () => setActivePane('editor'));

  // Setup scroll sync
  setupScrollSync();

  // Wire menu events
  wireMenuEvents();

  // Listen for file open from Rust (file association / CLI arg)
  listen('open-file', async (event) => {
    await openFile(event.payload);
  });

  // Render initial empty state
  renderMarkdown('');
}

function wireMenuEvents() {
  onMenuEvent('open', handleOpen);
  onMenuEvent('save', handleSave);
  onMenuEvent('save_as', handleSaveAs);
  onMenuEvent('reload', handleReload);

  onMenuEvent('find', () => openFind());

  onMenuEvent('format_bold', formatBold);
  onMenuEvent('format_italic', formatItalic);
  onMenuEvent('format_link', formatLink);

  onMenuEvent('toggle_edit_mode', toggleViewMode);

  onMenuEvent('zoom_in', () => { zoomIn(); updateEditorZoom(); });
  onMenuEvent('zoom_out', () => { zoomOut(); updateEditorZoom(); });
  onMenuEvent('zoom_reset', () => { zoomReset(); updateEditorZoom(); });

  onMenuEvent('theme_system', () => { setTheme('system'); saveSettings(); });
  onMenuEvent('theme_light', () => { setTheme('light'); saveSettings(); });
  onMenuEvent('theme_dark', () => { setTheme('dark'); saveSettings(); });
  onMenuEvent('theme_settings', () => openAppearanceSettings(getThemeSettings()));
}

function updateEditorZoom() {
  if (getActivePane() === 'editor') {
    setFontSize(getEditorFontSize());
  }
}

function toggleViewMode() {
  const idx = viewModes.indexOf(viewMode);
  viewMode = viewModes[(idx + 1) % viewModes.length];
  document.body.setAttribute('data-view-mode', viewMode);
  saveSettings();
}

async function handleOpen() {
  const selected = await openDialog({
    multiple: false,
    filters: [
      { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (selected) {
    await openFile(selected);
  }
}

async function openFile(filePath) {
  try {
    const contents = await invoke('read_file', { path: filePath });
    currentFilePath = filePath;
    setContent(contents);
    renderMarkdown(contents);

    // Set base dir for relative image paths
    const baseDir = await invoke('resolve_base_url', { filePath });
    setBaseDir(baseDir);

    // Update window title
    const fileName = filePath.split(/[/\\]/).pop();
    await getCurrentWindow().setTitle(`${fileName} — MDViewer+`);
  } catch (e) {
    console.error('Failed to open file:', e);
  }
}

async function handleSave() {
  if (!currentFilePath) {
    return handleSaveAs();
  }
  try {
    await invoke('write_file', { path: currentFilePath, contents: getContent() });
  } catch (e) {
    console.error('Failed to save file:', e);
  }
}

async function handleSaveAs() {
  const path = await saveDialog({
    filters: [
      { name: 'Markdown', extensions: ['md', 'markdown'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (path) {
    currentFilePath = path;
    await handleSave();
    const fileName = path.split(/[/\\]/).pop();
    await getCurrentWindow().setTitle(`${fileName} — MDViewer+`);
  }
}

async function handleReload() {
  if (currentFilePath) {
    await openFile(currentFilePath);
  }
}

function setupScrollSync() {
  const previewPane = document.getElementById('preview-pane');
  const editorView = getEditorView();
  if (!editorView) return;

  const editorScroller = editorView.scrollDOM;

  previewPane.addEventListener('scroll', () => {
    if (isSyncing) return;
    isSyncing = true;
    const fraction = previewPane.scrollTop / Math.max(1, previewPane.scrollHeight - previewPane.clientHeight);
    editorScroller.scrollTop = fraction * (editorScroller.scrollHeight - editorScroller.clientHeight);
    requestAnimationFrame(() => { isSyncing = false; });
  });

  editorScroller.addEventListener('scroll', () => {
    if (isSyncing) return;
    isSyncing = true;
    const fraction = editorScroller.scrollTop / Math.max(1, editorScroller.scrollHeight - editorScroller.clientHeight);
    previewPane.scrollTop = fraction * (previewPane.scrollHeight - previewPane.clientHeight);
    requestAnimationFrame(() => { isSyncing = false; });
  });
}

async function saveSettings() {
  try {
    const themeSettings = getThemeSettings();
    await invoke('save_settings', {
      settings: {
        ...themeSettings,
        zoom_level: getPreviewZoom(),
        editor_font_size: getEditorFontSize(),
        view_mode: viewMode,
      },
    });
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
}

// Boot
document.addEventListener('DOMContentLoaded', init);
