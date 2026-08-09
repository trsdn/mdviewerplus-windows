let dialog;
let input;
let list;
let status;
let entries = [];
let filtered = [];
let activeIndex = 0;
let onSelect;
let previousFocus;

function render() {
  const query = input.value.trim().toLocaleLowerCase();
  filtered = entries.filter((entry) => entry.text.toLocaleLowerCase().includes(query));
  activeIndex = Math.min(activeIndex, Math.max(0, filtered.length - 1));
  list.replaceChildren();

  for (const [index, entry] of filtered.entries()) {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'palette-option outline-option';
    option.style.setProperty('--outline-depth', String(Math.max(0, entry.level - 1)));
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', index === activeIndex ? 'true' : 'false');
    option.textContent = entry.text || '(untitled heading)';
    option.addEventListener('click', () => choose(index));
    list.appendChild(option);
  }
  status.textContent = filtered.length === 0 ? 'No headings found' : `${filtered.length} heading${filtered.length === 1 ? '' : 's'}`;
}

function choose(index) {
  const entry = filtered[index];
  if (!entry) return;
  dialog.close();
  onSelect(entry);
}

function setActive(index) {
  activeIndex = Math.max(0, Math.min(index, filtered.length - 1));
  render();
  list.children[activeIndex]?.scrollIntoView({ block: 'nearest' });
}

export function initOutline(options) {
  ({ onSelect } = options);
  dialog = document.getElementById('outline-dialog');
  input = document.getElementById('outline-input');
  list = document.getElementById('outline-results');
  status = document.getElementById('outline-status');

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
    input.value = '';
    previousFocus?.focus?.();
  });
}

export function setOutlineEntries(nextEntries) {
  entries = Array.isArray(nextEntries) ? nextEntries : [];
  if (dialog?.open) render();
}

export function openOutline() {
  if (dialog.open) return;
  previousFocus = document.activeElement;
  dialog.showModal();
  activeIndex = 0;
  render();
  input.focus();
}
