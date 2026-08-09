// Preview code-block controls.
//
// The exact fenced source is captured before any highlighting so Copy always
// reproduces the Markdown, even when highlighting is unavailable or fails.

const LANGUAGE_PATTERN = /^[a-z0-9][a-z0-9+#._-]{0,23}$/i;
const MAX_LINE_NUMBER_LINES = 2000;

const sourceRegistry = new WeakMap();

export const DIAGRAM_LANGUAGE = 'mermaid';

export function readLanguage(code) {
  for (const name of code.classList) {
    if (!name.startsWith('language-')) continue;
    const language = name.slice('language-'.length).toLowerCase();
    if (LANGUAGE_PATTERN.test(language)) return language;
  }
  return '';
}

export function getBlockSource(element) {
  return sourceRegistry.get(element) ?? '';
}

function rememberSource(element, source) {
  sourceRegistry.set(element, source);
  return element;
}

function createButton(document, action, label, { pressed } = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'code-block__button';
  button.dataset.codeAction = action;
  button.textContent = label;
  if (pressed !== undefined) button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
  return button;
}

/**
 * Replace `pre > code` blocks with an accessible figure that carries the
 * language label and the Copy/Wrap/Line-number controls.
 *
 * Mermaid fences are handed to the diagram pipeline instead when the edition
 * supports diagrams; they keep their source for a safe fallback.
 */
export function decorateCodeBlocks(root, { diagramsEnabled = false, sourceBlocks = [] } = {}) {
  const document = root.ownerDocument || globalThis.document;
  const blocks = [];
  const diagrams = [];

  for (const [blockIndex, code] of [...root.querySelectorAll('pre > code')].entries()) {
    const pre = code.parentElement;
    const language = readLanguage(code);
    const source = sourceBlocks[blockIndex]?.source ?? code.textContent ?? '';

    if (diagramsEnabled && language === DIAGRAM_LANGUAGE) {
      const container = document.createElement('div');
      container.className = 'diagram-block';
      container.dataset.diagramState = 'pending';
      rememberSource(container, source);

      const fallback = document.createElement('div');
      fallback.className = 'diagram-block__fallback';
      fallback.appendChild(pre.cloneNode(true));
      container.appendChild(fallback);

      pre.replaceWith(container);
      diagrams.push(container);
      continue;
    }

    const figure = document.createElement('figure');
    figure.className = 'code-block';
    if (language) figure.dataset.language = language;

    const header = document.createElement('div');
    header.className = 'code-block__header';

    const label = document.createElement('span');
    label.className = 'code-block__language';
    label.textContent = language || 'text';
    header.appendChild(label);

    const actions = document.createElement('div');
    actions.className = 'code-block__actions';
    actions.appendChild(createButton(document, 'copy', 'Copy'));
    actions.appendChild(createButton(document, 'wrap', 'Wrap', { pressed: false }));

    const lineCount = source.split('\n').length;
    const numbers = createButton(document, 'numbers', 'Lines', { pressed: false });
    if (lineCount > MAX_LINE_NUMBER_LINES) {
      numbers.disabled = true;
      numbers.title = `Line numbers are unavailable above ${MAX_LINE_NUMBER_LINES} lines.`;
    }
    actions.appendChild(numbers);
    header.appendChild(actions);

    const status = document.createElement('span');
    status.className = 'code-block__status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    pre.replaceWith(figure);
    figure.append(header, pre, status);
    pre.classList.add('code-block__pre');
    rememberSource(figure, source);
    blocks.push({ figure, pre, code, language, source });
  }

  return { blocks, diagrams };
}

function setLineNumbers(figure, enabled) {
  const pre = figure.querySelector('pre');
  if (!pre) return;
  const document = figure.ownerDocument || globalThis.document;

  const existing = figure.querySelector('.code-block__gutter');
  if (existing) existing.remove();
  figure.classList.toggle('code-block--numbered', enabled);
  if (!enabled) return;

  const lines = getBlockSource(figure).split('\n');
  if (lines.length > MAX_LINE_NUMBER_LINES) return;
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();

  const gutter = document.createElement('div');
  gutter.className = 'code-block__gutter';
  gutter.setAttribute('aria-hidden', 'true');
  gutter.textContent = lines.map((_, index) => index + 1).join('\n');
  pre.parentElement.insertBefore(gutter, pre);
}

function announce(figure, text) {
  const status = figure.querySelector('.code-block__status');
  if (!status) return;
  status.textContent = text;
  const timer = setTimeout(() => {
    if (status.textContent === text) status.textContent = '';
  }, 2500);
  if (typeof timer === 'object' && typeof timer.unref === 'function') timer.unref();
}

/**
 * Delegate control activation from the preview root. One listener serves every
 * block, so large documents add no per-block cost.
 */
export function attachCodeBlockControls(root, { copyText }) {
  const handler = (event) => {
    const button = event.target.closest?.('button[data-code-action]');
    if (!button || !root.contains(button)) return;
    const figure = button.closest('.code-block');
    if (!figure) return;

    event.preventDefault();
    const action = button.dataset.codeAction;

    if (action === 'copy') {
      const source = getBlockSource(figure);
      Promise.resolve(copyText(source)).then((copied) => {
        announce(figure, copied ? 'Copied' : 'Copy failed');
      });
      return;
    }

    if (action === 'wrap') {
      const enabled = button.getAttribute('aria-pressed') !== 'true';
      button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
      figure.classList.toggle('code-block--wrapped', enabled);
      announce(figure, enabled ? 'Wrapping on' : 'Wrapping off');
      return;
    }

    if (action === 'numbers') {
      const enabled = button.getAttribute('aria-pressed') !== 'true';
      button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
      setLineNumbers(figure, enabled);
      announce(figure, enabled ? 'Line numbers on' : 'Line numbers off');
    }
  };

  root.addEventListener('click', handler);
  return () => root.removeEventListener('click', handler);
}

export const CODE_BLOCK_LIMITS = Object.freeze({ maxLineNumberLines: MAX_LINE_NUMBER_LINES });
