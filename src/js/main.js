// Main orchestrator: init, menu events, file open, state management

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  confirm,
  message,
  open as openDialog,
  save as saveDialog,
} from '@tauri-apps/plugin-dialog';

import { CAPABILITIES } from '#edition';
import {
  initEditor,
  setContent,
  getContent,
  setFontSize,
  formatBold,
  formatItalic,
  formatLink,
  openFind as openEditorFind,
  getEditorView,
  getEditorElement,
  moveCaretToLine,
} from './editor.js';
import {
  canNavigate,
  documentTitle,
  loadedDocument,
  newDocument,
  requiresDiscardConfirmation,
  saveAsCompletion,
  savedDocument,
} from './document-policy.js';
import { createDocumentOperationQueue } from './document-operation-queue.js';
import { initImageViewer, openImageViewer } from './image-viewer.js';
import { performOpenFile } from './open-file-operation.js';
import {
  getPreviewPane,
  initPreview,
  preparePrint,
  refreshPreview,
  renderMarkdown,
  scheduleRender,
  scrollToFragment,
  teardownPreview,
} from './markdown/pipeline.js';
import { initOutline, openOutline, setOutlineEntries } from './outline.js';
import {
  closePreviewFind,
  initPreviewFind,
  isPreviewFindOpen,
  openPreviewFind,
  previewFindNext,
  refreshPreviewFind,
} from './preview-find.js';
import { handleFolderChanged, initQuickOpen, openQuickOpen } from './quick-open.js';
import { initSplitPane } from './split-pane.js';
import { initShortcuts, onMenuEvent } from './shortcuts.js';
import { initTheme, setTheme, setThemeSettings, getThemeSettings } from './theme.js';
import { initAppearanceSettings, openAppearanceSettings } from './appearance-settings.js';
import { initializeStartupDocument } from './startup-document.js';
import { initZoom, zoomIn, zoomOut, zoomReset, setActivePane, getPreviewZoom, getEditorFontSize, getActivePane } from './zoom.js';
import { closeAfterApproval } from './window-close-policy.js';

// App state
let documentState = newDocument();
let viewMode = 'view';
const viewModes = ['view', 'split', 'edit'];
let closeApproved = false;
let closeRequestQueued = false;
const documentOperations = createDocumentOperationQueue();
let documentRevision = 0;
let titleRevision = 0;
let titleUpdates = Promise.resolve();
let watcherGeneration = 0;

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
  initTheme(settings, () => refreshPreview());
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
    documentRevision += 1;
    scheduleRender(text);
    updateWindowTitle();
  });
  setFontSize(settings.editor_font_size);

  // Init preview
  initPreview({
    openInternalLink: openInternalLink,
    openExternalUrl: (url) => invoke('open_external_url', { url })
      .catch((error) => showError('Could not open the external link.', error)),
    loadImage: (relativePath) => {
      if (!documentState.path) return null;
      return invoke('read_local_image', {
        currentPath: documentState.path,
        relativePath,
      });
    },
    onOutlineChange: setOutlineEntries,
    onImageActivate: openImageViewer,
    onAfterRender: refreshPreviewFind,
  });
  initPreviewFind();
  initImageViewer();
  initOutline({
    onSelect: (entry) => {
      scrollToFragment(entry.id);
      if (entry.line) moveCaretToLine(entry.line);
    },
  });
  initQuickOpen({
    loadFiles: () => {
      if (!documentState.path) return [];
      return invoke('list_markdown_files', { currentPath: documentState.path });
    },
    openFile: (path) => enqueueDocumentOperation(
      'Could not open the selected Markdown file.',
      () => openFile(path),
    ),
  });
  document.getElementById('about-edition').textContent = CAPABILITIES.label;
  document.getElementById('about-version').textContent = __MDVIEWER_VERSION__;

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

  await listen('folder-changed', (event) => {
    if (event.payload?.generation !== watcherGeneration) return;
    handleFolderChanged();
  });

  // Register for later file-association/single-instance opens before taking startup work.
  await listen('open-file', async (event) => {
    await enqueueDocumentOperation(
      'Could not process the requested Markdown file.',
      () => openFile(event.payload),
    );
  });

  await getCurrentWindow().onCloseRequested(async (event) => {
    if (closeApproved) return;
    event.preventDefault();
    if (closeRequestQueued) return;

    closeRequestQueued = true;
    await enqueueDocumentOperation('Could not close MDViewer+ safely.', async () => {
      if (await confirmDiscard('close the window')) {
        await closeAfterApproval(
          async () => {
            await stopFolderWatcher();
            teardownPreview();
            await getCurrentWindow().close();
          },
          (approved) => { closeApproved = approved; },
        );
      }
    });
    closeRequestQueued = false;
  });

  // Render empty first, then replace it through the exactly-once startup handshake.
  await initializeStartupDocument({
    renderEmpty: () => renderMarkdown(''),
    takeStartupPath: () => invoke('take_startup_file'),
    openStartupPath: (startupFilePath) => enqueueDocumentOperation(
      'Could not process the startup Markdown file.',
      () => openFile(startupFilePath),
    ),
  });
  updateWindowTitle();
  window.addEventListener('beforeprint', () => {
    void preparePrint();
  });
}

function wireMenuEvents() {
  onMenuEvent('new', () => enqueueDocumentOperation(
    'Could not create a new document.',
    handleNew,
  ));
  onMenuEvent('open', () => enqueueDocumentOperation(
    'Could not complete the Open operation.',
    handleOpen,
  ));
  onMenuEvent('save', () => enqueueDocumentOperation(
    'Could not complete the Save operation.',
    handleSave,
  ));
  onMenuEvent('save_as', () => enqueueDocumentOperation(
    'Could not complete the Save As operation.',
    handleSaveAs,
  ));
  onMenuEvent('reload', () => enqueueDocumentOperation(
    'Could not reload the document.',
    handleReload,
  ));
  onMenuEvent('previous_file', () => enqueueDocumentOperation(
    'Could not navigate to the previous Markdown file.',
    () => handleSiblingNavigation('previous'),
  ));
  onMenuEvent('next_file', () => enqueueDocumentOperation(
    'Could not navigate to the next Markdown file.',
    () => handleSiblingNavigation('next'),
  ));
  onMenuEvent('quit', () => getCurrentWindow().close());

  onMenuEvent('find', openFind);
  onMenuEvent('find_next', () => findAgain(false));
  onMenuEvent('find_previous', () => findAgain(true));
  onMenuEvent('quick_open', openQuickOpen);
  onMenuEvent('outline', openOutline);
  onMenuEvent('print', () => {
    void preparePrint().then(() => window.print());
  });

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
  onMenuEvent('about', () => document.getElementById('about-dialog').showModal());
}

function openFind() {
  if (getActivePane() === 'editor' || viewMode === 'edit') {
    closePreviewFind();
    openEditorFind();
  } else {
    openPreviewFind();
  }
}

function findAgain(previous) {
  if (isPreviewFindOpen() || getActivePane() === 'preview') {
    previewFindNext(previous);
  } else {
    openEditorFind();
  }
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
  try {
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
  } catch (error) {
    await showError('Could not open the file picker.', error);
  }
}

async function openFile(filePath) {
  try {
    const opened = await performOpenFile({
      confirmReplacement: () => confirmDiscard('open another file'),
      getDocumentRevision: () => documentRevision,
      readTarget: async () => {
        const contents = await invoke('read_file', { path: filePath });
        return { contents };
      },
      applyTarget: ({ contents }) => {
        documentState = loadedDocument(filePath, contents);
        setContent(contents);
        renderMarkdown(contents);
        updateWindowTitle();
      },
    });
    if (opened) await restartFolderWatcher(filePath);
    return opened;
  } catch (error) {
    await showError('Could not open the Markdown file.', error);
    return false;
  }
}

async function handleNew() {
  if (!await confirmDiscard('create a new file')) return;

  documentState = newDocument();
  await stopFolderWatcher();
  setContent('');
  renderMarkdown('');
  updateWindowTitle();
}

async function confirmDiscard(action) {
  if (!requiresDiscardConfirmation(documentState, getContent())) return true;

  try {
    return await confirm(
      `The current document has unsaved changes. Discard them and ${action}?`,
      {
        title: 'Unsaved Changes — MDViewer+',
        kind: 'warning',
        okLabel: 'Discard Changes',
        cancelLabel: 'Cancel',
      },
    );
  } catch (error) {
    await showError('Could not ask for confirmation. Your changes were kept.', error);
    return false;
  }
}

async function handleSave() {
  if (!documentState.path) {
    return handleSaveAs();
  }
  const path = documentState.path;
  const contents = getContent();
  try {
    await invoke('write_file', { path, contents });
  } catch (error) {
    await showError('Could not save the Markdown file.', error);
    return false;
  }
  documentState = savedDocument(documentState, path, contents);
  updateWindowTitle();
  return true;
}

async function handleSaveAs() {
  let path;
  try {
    path = await saveDialog({
      filters: [
        { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
  } catch (error) {
    await showError('Could not open the Save As picker.', error);
    return false;
  }
  if (!path) return false;

  const contents = getContent();
  try {
    await invoke('write_file', { path, contents });
  } catch (error) {
    await showError('Could not save the Markdown file.', error);
    return false;
  }

  const completion = saveAsCompletion(documentState, path, contents, getContent());
  documentState = completion.state;
  renderMarkdown(completion.previewContent);
  updateWindowTitle();
  await restartFolderWatcher(path);
  return true;
}

async function openInternalLink({ path, fragment }) {
  if (!documentState.path) return false;
  return enqueueDocumentOperation(
    'Could not open the internal Markdown link.',
    async () => {
      const target = await invoke('resolve_internal_markdown', {
        currentPath: documentState.path,
        relativePath: path,
      });
      const opened = await openFile(target);
      if (opened && fragment) scrollToFragment(fragment);
      return opened;
    },
  );
}

async function restartFolderWatcher(path) {
  await stopFolderWatcher();
  try {
    watcherGeneration = await invoke('start_folder_watcher', { currentPath: path });
  } catch (error) {
    watcherGeneration = 0;
    console.error('Could not start the folder watcher:', error);
  }
}

async function stopFolderWatcher() {
  watcherGeneration = 0;
  try {
    await invoke('stop_folder_watcher');
  } catch (error) {
    console.error('Could not stop the folder watcher:', error);
  }
}

async function handleReload() {
  if (!documentState.path) {
    await message('Untitled documents cannot be reloaded.', {
      title: 'Reload — MDViewer+',
      kind: 'info',
    });
    return;
  }
  await openFile(documentState.path);
}

async function handleSiblingNavigation(direction) {
  if (!canNavigate(documentState)) {
    await message('Save the untitled document before navigating to sibling files.', {
      title: 'Markdown Navigation — MDViewer+',
      kind: 'info',
    });
    return;
  }

  let siblingPath;
  try {
    siblingPath = await invoke('sibling_markdown_file', {
      currentPath: documentState.path,
      direction,
    });
  } catch (error) {
    await showError('Could not enumerate sibling Markdown files.', error);
    return;
  }

  if (!siblingPath) {
    await message(
      direction === 'previous'
        ? 'There is no previous Markdown file.'
        : 'There is no next Markdown file.',
      { title: 'Markdown Navigation — MDViewer+', kind: 'info' },
    );
    return;
  }
  await openFile(siblingPath);
}

function errorDetail(error) {
  if (error && typeof error === 'object' && typeof error.message === 'string') {
    return error.message;
  }
  return String(error);
}

async function enqueueDocumentOperation(errorSummary, operation) {
  try {
    return await documentOperations.enqueue(operation);
  } catch (error) {
    await showError(errorSummary, error);
    return false;
  }
}

async function showError(summary, error) {
  const detail = errorDetail(error);
  try {
    await message(`${summary}\n\n${detail}`, {
      title: 'MDViewer+ Error',
      kind: 'error',
    });
  } catch (dialogError) {
    console.error(summary, detail, 'Additionally failed to show the error dialog:', dialogError);
  }
}

function updateWindowTitle() {
  const revision = ++titleRevision;
  const title = documentTitle(documentState, getContent());
  titleUpdates = titleUpdates
    .catch(() => undefined)
    .then(async () => {
      if (revision !== titleRevision) return;
      await getCurrentWindow().setTitle(title);
    })
    .catch((error) => {
      console.error('Failed to update the window title:', error);
    });
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
document.addEventListener('DOMContentLoaded', () => {
  init().catch((error) => showError('Could not initialize MDViewer+.', error));
});
