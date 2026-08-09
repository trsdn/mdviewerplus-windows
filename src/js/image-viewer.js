const MIN_SCALE = 0.1;
const MAX_SCALE = 8;

let dialog;
let stage;
let image;
let caption;
let scale = 1;
let fitScale = 1;
let offsetX = 0;
let offsetY = 0;
let drag = null;
let previousFocus = null;

function applyTransform() {
  image.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
  document.getElementById('image-zoom-status').textContent = `${Math.round(scale * 100)}%`;
}

function resetOffset() {
  offsetX = 0;
  offsetY = 0;
}

function setScale(next, anchorX = 0, anchorY = 0) {
  const bounded = Math.max(MIN_SCALE, Math.min(MAX_SCALE, next));
  const ratio = bounded / scale;
  offsetX = anchorX - (anchorX - offsetX) * ratio;
  offsetY = anchorY - (anchorY - offsetY) * ratio;
  scale = bounded;
  applyTransform();
}

function fit() {
  const width = image.naturalWidth || 1;
  const height = image.naturalHeight || 1;
  fitScale = Math.min(
    1,
    Math.max(MIN_SCALE, (stage.clientWidth - 32) / width),
    Math.max(MIN_SCALE, (stage.clientHeight - 32) / height),
  );
  resetOffset();
  scale = fitScale;
  applyTransform();
}

function actualSize() {
  resetOffset();
  scale = 1;
  applyTransform();
}

export function initImageViewer() {
  dialog = document.getElementById('image-viewer');
  stage = document.getElementById('image-viewer-stage');
  image = document.getElementById('image-viewer-image');
  caption = document.getElementById('image-viewer-caption');

  document.getElementById('image-zoom-in').addEventListener('click', () => setScale(scale * 1.2));
  document.getElementById('image-zoom-out').addEventListener('click', () => setScale(scale / 1.2));
  document.getElementById('image-zoom-fit').addEventListener('click', fit);
  document.getElementById('image-zoom-actual').addEventListener('click', actualSize);
  document.getElementById('image-zoom-close').addEventListener('click', () => dialog.close());

  image.addEventListener('load', fit);
  stage.addEventListener('wheel', (event) => {
    event.preventDefault();
    const rect = stage.getBoundingClientRect();
    setScale(
      scale * (event.deltaY < 0 ? 1.1 : 0.9),
      event.clientX - rect.left - rect.width / 2,
      event.clientY - rect.top - rect.height / 2,
    );
  }, { passive: false });
  stage.addEventListener('pointerdown', (event) => {
    drag = { x: event.clientX, y: event.clientY, offsetX, offsetY };
    stage.setPointerCapture(event.pointerId);
  });
  stage.addEventListener('pointermove', (event) => {
    if (!drag) return;
    offsetX = drag.offsetX + event.clientX - drag.x;
    offsetY = drag.offsetY + event.clientY - drag.y;
    applyTransform();
  });
  stage.addEventListener('pointerup', () => { drag = null; });
  stage.addEventListener('pointercancel', () => { drag = null; });
  dialog.addEventListener('keydown', (event) => {
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      setScale(scale * 1.2);
    } else if (event.key === '-') {
      event.preventDefault();
      setScale(scale / 1.2);
    } else if (event.key === '0') {
      event.preventDefault();
      fit();
    } else if (event.key === '1') {
      event.preventDefault();
      actualSize();
    }
  });
  dialog.addEventListener('close', () => {
    image.removeAttribute('src');
    previousFocus?.focus?.();
  });
}

export function openImageViewer(sourceImage) {
  if (!sourceImage?.src?.startsWith('blob:')) return false;
  previousFocus = sourceImage;
  caption.textContent = sourceImage.alt || sourceImage.dataset.imagePath || 'Local image';
  image.alt = sourceImage.alt || '';
  image.src = sourceImage.src;
  if (!dialog.open) dialog.showModal();
  if (image.complete) fit();
  return true;
}
