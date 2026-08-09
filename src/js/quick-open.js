const MAX_RESULTS = 200;

let dialog;
let input;
let list;
let status;
let allFiles = [];
let results = [];
let activeIndex = 0;
let loadFiles;
let openFile;
let previousFocus;

function compareFiles(left, right) {
  return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
    || left.name.localeCompare(right.name)
    || left.path.localeCompare(right.path);
}

export function filterQuickOpenFiles(files, query) {
  const needle = String(query || '').trim().toLocaleLowerCase();
  return files
    .map((file) => {
      const name = String(file.name || '');
      const lower = name.toLocaleLowerCase();
      const index = lower.indexOf(needle);
      return { ...file, score: needle === '' ? 0 : index };
    })
    .filter((file) => file.score >= 0)
    .sort((left, right) => left.score - right.score || compareFiles(left, right))
    .slice(0, MAX_RESULTS);
}

function render() {
  results = filterQuickOpenFiles(allFiles, input.value);
  activeIndex = Math.min(activeIndex, Math.max(0, results.length - 1));
  list.replaceChildren();

  for (const [index, file] of results.entries()) {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'palette-option';
    option.dataset.index = String(index);
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', index === activeIndex ? 'true' : 'false');
    option.textContent = file.name;
    option.addEventListener('click', () => choose(index));
    list.appendChild(option);
  }
  status.textContent = results.length === 0 ? 'No Markdown files found' : `${results.length} file${results.length === 1 ? '' : 's'}`;
  list.children[activeIndex]?.scrollIntoView({ block: 'nearest' });
}

function setActive(index) {
  activeIndex = Math.max(0, Math.min(index, results.length - 1));
  for (const [optionIndex, option] of [...list.children].entries()) {
    option.setAttribute('aria-selected', optionIndex === activeIndex ? 'true' : 'false');
  }
  list.children[activeIndex]?.scrollIntoView({ block: 'nearest' });
}

async function choose(index) {
  const file = results[index];
  if (!file) return;
  dialog.close();
  await openFile(file.path);
}

async function refresh() {
  if (!dialog.open) return;
  try {
    const files = await loadFiles();
    if (!dialog.open) return;
    allFiles = Array.isArray(files) ? files.slice().sort(compareFiles) : [];
    render();
  } catch {
    allFiles = [];
    render();
    status.textContent = 'Current folder is unavailable';
  }
}

export function initQuickOpen(options) {
  ({ loadFiles, openFile } = options);
  dialog = document.getElementById('quick-open');
  input = document.getElementById('quick-open-input');
  list = document.getElementById('quick-open-results');
  status = document.getElementById('quick-open-status');

  input.addEventListener('input', () => {
    activeIndex = 0;
    render();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive(activeIndex + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(activeIndex - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(activeIndex);
    }
  });
  dialog.addEventListener('close', () => {
    allFiles = [];
    results = [];
    list.replaceChildren();
    input.value = '';
    previousFocus?.focus?.();
  });
}

export function openQuickOpen() {
  if (dialog.open) return;
  previousFocus = document.activeElement;
  dialog.showModal();
  input.focus();
  refresh();
}

export function handleFolderChanged() {
  return refresh();
}

export function isQuickOpenOpen() {
  return Boolean(dialog?.open);
}
