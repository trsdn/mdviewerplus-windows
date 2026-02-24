// Dual zoom: preview CSS zoom + editor font size
// Active pane tracking determines which zoom changes

let previewZoom = 1.0;
let editorFontSize = 14.0;
let activePane = 'preview'; // 'editor' | 'preview'
let onZoomChangeCallback = null;

const PREVIEW_MIN = 0.5;
const PREVIEW_MAX = 3.0;
const PREVIEW_STEP = 0.1;
const EDITOR_MIN = 8;
const EDITOR_MAX = 72;
const EDITOR_STEP = 1;

export function initZoom(savedPreviewZoom, savedEditorFontSize, onChange) {
  previewZoom = savedPreviewZoom || 1.0;
  editorFontSize = savedEditorFontSize || 14.0;
  onZoomChangeCallback = onChange;
  applyPreviewZoom();
}

export function setActivePane(pane) {
  activePane = pane;
}

export function getActivePane() {
  return activePane;
}

export function zoomIn() {
  if (activePane === 'preview') {
    previewZoom = Math.min(PREVIEW_MAX, previewZoom + PREVIEW_STEP);
    applyPreviewZoom();
  } else {
    editorFontSize = Math.min(EDITOR_MAX, editorFontSize + EDITOR_STEP);
  }
  notifyChange();
}

export function zoomOut() {
  if (activePane === 'preview') {
    previewZoom = Math.max(PREVIEW_MIN, previewZoom - PREVIEW_STEP);
    applyPreviewZoom();
  } else {
    editorFontSize = Math.max(EDITOR_MIN, editorFontSize - EDITOR_STEP);
  }
  notifyChange();
}

export function zoomReset() {
  if (activePane === 'preview') {
    previewZoom = 1.0;
    applyPreviewZoom();
  } else {
    editorFontSize = 14.0;
  }
  notifyChange();
}

export function getPreviewZoom() {
  return previewZoom;
}

export function getEditorFontSize() {
  return editorFontSize;
}

function applyPreviewZoom() {
  const el = document.getElementById('preview-content');
  if (el) {
    el.style.zoom = previewZoom;
  }
}

function notifyChange() {
  if (onZoomChangeCallback) {
    onZoomChangeCallback({ previewZoom, editorFontSize, activePane });
  }
}
