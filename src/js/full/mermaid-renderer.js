import { sanitizeDiagramSvg } from '../security/sanitizer.js';

export const MERMAID_LIMITS = Object.freeze({
  maxDiagrams: 20,
  maxSourceCharacters: 100 * 1024,
  maxConcurrent: 2,
  timeoutMilliseconds: 12_000,
});

let mermaidPromise = null;
let panZoomPromise = null;
let renderSequence = 0;
const panZoomInstances = new WeakMap();

async function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((module) => module.default || module);
  }
  return mermaidPromise;
}

function configureMermaid(mermaid) {
  const styles = getComputedStyle(document.documentElement);
  const color = (name) => styles.getPropertyValue(name).trim();
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    htmlLabels: false,
    suppressErrorRendering: true,
    flowchart: { htmlLabels: false },
    sequence: { useMaxWidth: true },
    theme: 'base',
    themeVariables: {
      background: color('--theme-background'),
      primaryColor: color('--theme-code-background'),
      primaryTextColor: color('--theme-foreground'),
      primaryBorderColor: color('--theme-border'),
      lineColor: color('--theme-blockquote-foreground'),
      secondaryColor: color('--theme-background'),
      tertiaryColor: color('--theme-code-background'),
      noteBkgColor: color('--theme-code-background'),
      noteTextColor: color('--theme-foreground'),
    },
  });
}

async function loadPanZoom() {
  if (!panZoomPromise) {
    panZoomPromise = import('svg-pan-zoom').then((module) => module.default || module);
  }
  return panZoomPromise;
}

function renderTimeout(promise) {
  let timeout;
  const deadline = new Promise((_, reject) => {
    timeout = setTimeout(
      () => reject(new Error('The diagram took too long to render.')),
      MERMAID_LIMITS.timeoutMilliseconds,
    );
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timeout));
}

function showError(container, message) {
  container.dataset.diagramState = 'error';
  container.querySelector('.diagram-block__error')?.remove();
  const error = container.ownerDocument.createElement('p');
  error.className = 'diagram-block__error';
  error.setAttribute('role', 'alert');
  error.textContent = message;
  container.appendChild(error);
}

function createButton(document, action, label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.diagramAction = action;
  button.textContent = label;
  return button;
}

function addControls(container, instance) {
  const document = container.ownerDocument;
  const controls = document.createElement('div');
  controls.className = 'diagram-block__controls';
  controls.setAttribute('aria-label', 'Diagram zoom and pan controls');
  controls.append(
    createButton(document, 'zoom-in', 'Zoom in'),
    createButton(document, 'zoom-out', 'Zoom out'),
    createButton(document, 'fit', 'Fit'),
    createButton(document, 'reset', 'Reset'),
  );
  controls.addEventListener('click', (event) => {
    const action = event.target.closest?.('button[data-diagram-action]')?.dataset.diagramAction;
    if (action === 'zoom-in') instance.zoomIn();
    else if (action === 'zoom-out') instance.zoomOut();
    else if (action === 'fit') {
      instance.resize();
      instance.fit();
      instance.center();
    } else if (action === 'reset') {
      instance.resetZoom();
      instance.center();
    }
  });
  container.insertBefore(controls, container.firstChild);

  container.tabIndex = 0;
  container.setAttribute('role', 'group');
  container.setAttribute('aria-label', 'Interactive Mermaid diagram');
  container.addEventListener('keydown', (event) => {
    const step = 30;
    if (event.key === '+' || event.key === '=') instance.zoomIn();
    else if (event.key === '-') instance.zoomOut();
    else if (event.key === '0') {
      instance.resize();
      instance.fit();
      instance.center();
    } else if (event.key === 'ArrowLeft') instance.panBy({ x: step, y: 0 });
    else if (event.key === 'ArrowRight') instance.panBy({ x: -step, y: 0 });
    else if (event.key === 'ArrowUp') instance.panBy({ x: 0, y: step });
    else if (event.key === 'ArrowDown') instance.panBy({ x: 0, y: -step });
    else return;
    event.preventDefault();
  });
}

async function renderOne(container, { isCurrent, getSource, mermaid }) {
  if (!isCurrent() || !container.isConnected) return;
  const source = getSource(container);
  if (!source || source.length > MERMAID_LIMITS.maxSourceCharacters) {
    showError(container, 'Diagram source exceeds the safe rendering limit.');
    return;
  }

  container.dataset.diagramState = 'rendering';
  try {
    if (!isCurrent() || !container.isConnected) return;
    const id = `mdviewer-mermaid-${++renderSequence}`;
    const result = await renderTimeout(mermaid.render(id, source));
    if (!isCurrent() || !container.isConnected) return;

    const svg = sanitizeDiagramSvg(result.svg);
    if (!svg) throw new Error('The rendered diagram did not pass SVG validation.');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Mermaid diagram');
    svg.removeAttribute('height');
    svg.removeAttribute('width');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    const viewport = container.ownerDocument.createElement('div');
    viewport.className = 'diagram-block__viewport';
    viewport.appendChild(svg);
    container.replaceChildren(viewport);

    if (!isCurrent() || !container.isConnected) return;
    const createPanZoom = await loadPanZoom();
    if (!isCurrent() || !container.isConnected) return;
    const instance = createPanZoom(svg, {
      controlIconsEnabled: false,
      dblClickZoomEnabled: true,
      mouseWheelZoomEnabled: false,
      preventMouseEventsDefault: false,
      contain: true,
      center: true,
      fit: true,
      minZoom: 0.2,
      maxZoom: 10,
    });
    panZoomInstances.set(container, instance);
    addControls(container, instance);
    instance.resize();
    instance.fit();
    instance.center();
    container.dataset.diagramState = 'rendered';
  } catch (error) {
    if (isCurrent() && container.isConnected) {
      showError(
        container,
        error instanceof Error ? error.message : 'The diagram could not be rendered.',
      );
    }
  }
}

async function renderPool(containers, options) {
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(MERMAID_LIMITS.maxConcurrent, containers.length) },
    async () => {
      while (nextIndex < containers.length) {
        const index = nextIndex++;
        await renderOne(containers[index], options);
      }
    },
  );
  await Promise.all(workers);
}

function lazyRender(containers, options) {
  if (typeof IntersectionObserver !== 'function') {
    void renderPool(containers, options);
    return;
  }
  const queue = [];
  let active = 0;
  const pump = () => {
    while (active < MERMAID_LIMITS.maxConcurrent && queue.length > 0) {
      active += 1;
      const container = queue.shift();
      void renderOne(container, options).finally(() => {
        active -= 1;
        pump();
      });
    }
  };
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      queue.push(entry.target);
    }
    pump();
  }, { rootMargin: '300px 0px' });
  for (const container of containers) observer.observe(container);
}

export const diagramRenderer = Object.freeze({
  id: 'mermaid',

  async render(containers, options) {
    const mermaid = await loadMermaid();
    if (!options.isCurrent()) return;
    configureMermaid(mermaid);
    const renderOptions = { ...options, mermaid };
    const bounded = containers.slice(0, MERMAID_LIMITS.maxDiagrams);
    for (const overflow of containers.slice(MERMAID_LIMITS.maxDiagrams)) {
      showError(overflow, `Only ${MERMAID_LIMITS.maxDiagrams} diagrams are rendered per document.`);
    }
    if (options.forceAll) {
      await renderPool(bounded, renderOptions);
    } else {
      lazyRender(bounded, renderOptions);
    }
  },

  fit(container) {
    const instance = panZoomInstances.get(container);
    if (!instance) return false;
    instance.resize();
    instance.fit();
    instance.center();
    return true;
  },
});
