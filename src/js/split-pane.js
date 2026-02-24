// Draggable splitter for split view

export function initSplitPane() {
  const splitter = document.getElementById('splitter');
  const editorPane = document.getElementById('editor-pane');
  const previewPane = document.getElementById('preview-pane');
  const app = document.getElementById('app');

  let isDragging = false;

  splitter.addEventListener('mousedown', (e) => {
    isDragging = true;
    splitter.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const rect = app.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const totalWidth = rect.width;
    const splitterWidth = splitter.offsetWidth;
    const minPane = 200;

    const editorWidth = Math.max(minPane, Math.min(x, totalWidth - splitterWidth - minPane));
    const previewWidth = totalWidth - editorWidth - splitterWidth;

    editorPane.style.flex = 'none';
    editorPane.style.width = editorWidth + 'px';
    previewPane.style.flex = 'none';
    previewPane.style.width = previewWidth + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      splitter.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });
}
