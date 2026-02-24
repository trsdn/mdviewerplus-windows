// Markdown preview rendering with marked.js + link interception

import { marked } from 'marked';

let baseDir = '';
let previewEl = null;

export function initPreview() {
  previewEl = document.getElementById('preview-content');

  // Configure marked for GFM
  marked.setOptions({
    gfm: true,
    breaks: true,
  });

  // Intercept link clicks — open external links in default browser
  previewEl.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href) return;

    e.preventDefault();

    if (href.startsWith('http://') || href.startsWith('https://')) {
      // Open external links in default browser
      import('@tauri-apps/plugin-shell').then(({ open }) => {
        open(href);
      });
    }
  });
}

export function setBaseDir(dir) {
  baseDir = dir;
}

export function renderMarkdown(markdown) {
  if (!previewEl) return;

  // Resolve relative image paths
  const renderer = new marked.Renderer();
  const originalImage = renderer.image.bind(renderer);

  renderer.image = function({ href, title, text }) {
    if (href && !href.startsWith('http://') && !href.startsWith('https://') && !href.startsWith('data:') && baseDir) {
      // Use Tauri asset protocol for local images
      const fullPath = baseDir + '/' + href;
      try {
        // convertFileSrc converts a file path to an asset protocol URL
        href = window.__TAURI__?.core?.convertFileSrc?.(fullPath) || 'asset://localhost/' + encodeURI(fullPath);
      } catch {
        href = 'asset://localhost/' + encodeURI(fullPath);
      }
    }
    const titleAttr = title ? ` title="${title}"` : '';
    const altText = text || '';
    return `<img src="${href}" alt="${altText}"${titleAttr}>`;
  };

  const html = marked.parse(markdown, { renderer });
  previewEl.innerHTML = html;
}

export function getPreviewElement() {
  return previewEl;
}

export function getPreviewPane() {
  return document.getElementById('preview-pane');
}
