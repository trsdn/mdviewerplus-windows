// Local image handling.
//
// Images are never loaded straight from Markdown. Local paths are resolved and
// read by Rust inside the document folder; everything else is replaced with an
// accessible placeholder because the application performs no network access.

import { classifyImageSource, LINK_KIND } from '../security/url-policy.js';

const BLOCK_REASONS = Object.freeze({
  'remote-image': 'Remote image not loaded',
  'unsupported-image-target': 'Unsupported image reference',
  empty: 'Missing image reference',
});

function placeholderFor(image, reason) {
  const document = image.ownerDocument || globalThis.document;
  const alternative = (image.getAttribute('alt') || '').trim();
  const placeholder = document.createElement('span');
  placeholder.className = 'preview-image-blocked';
  placeholder.setAttribute('role', 'img');
  placeholder.setAttribute(
    'aria-label',
    alternative ? `${alternative} — ${reason}` : reason,
  );

  const badge = document.createElement('span');
  badge.className = 'preview-image-blocked__badge';
  badge.setAttribute('aria-hidden', 'true');
  badge.textContent = reason;

  const caption = document.createElement('span');
  caption.className = 'preview-image-blocked__alt';
  caption.setAttribute('aria-hidden', 'true');
  caption.textContent = alternative;

  placeholder.append(badge, caption);
  return placeholder;
}

/**
 * Strip unresolved sources and return the local images that still need native
 * resolution. Returning them keeps the DOM pass synchronous and cancellable.
 */
export function decorateImages(root) {
  const pending = [];

  for (const image of [...root.querySelectorAll('img')]) {
    const source = image.getAttribute('src') || '';
    const classified = classifyImageSource(source);

    if (classified.kind !== LINK_KIND.internal) {
      image.replaceWith(placeholderFor(image, BLOCK_REASONS[classified.reason] || 'Image not available'));
      continue;
    }

    // Remove the raw path so the WebView never attempts a load of its own.
    image.removeAttribute('src');
    image.classList.add('preview-image');
    image.setAttribute('data-image-state', 'pending');
    image.setAttribute('tabindex', '0');
    image.setAttribute('role', 'button');
    image.setAttribute('aria-label', `${image.getAttribute('alt') || 'Local image'} — open image viewer`);
    pending.push({ image, path: classified.path });
  }

  return pending;
}

function decodeBase64(base64) {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/**
 * Resolve pending images through the native loader. Object URLs are tracked so
 * a superseded render can release them immediately.
 */
export async function resolveImages(pending, { loadImage, isCurrent = () => true } = {}) {
  const objectUrls = [];

  for (const { image, path } of pending) {
    if (!isCurrent()) break;

    try {
      const payload = await loadImage(path);
      if (!isCurrent()) break;
      if (!payload || typeof payload.base64 !== 'string' || typeof payload.mime !== 'string') {
        throw new Error('The image could not be read.');
      }
      const blob = new Blob([decodeBase64(payload.base64)], { type: payload.mime });
      const url = URL.createObjectURL(blob);
      objectUrls.push(url);
      image.src = url;
      image.setAttribute('data-image-state', 'loaded');
      image.setAttribute('data-image-path', path);
    } catch {
      if (!isCurrent()) break;
      image.replaceWith(placeholderFor(image, 'Image not available'));
    }
  }

  return objectUrls;
}
