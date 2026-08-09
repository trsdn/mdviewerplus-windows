// GFM task lists.
//
// The Markdown source stays authoritative: preview checkboxes are always
// read-only and never write back into the document.

export function decorateTaskLists(root) {
  const document = root.ownerDocument || globalThis.document;
  let count = 0;

  for (const checkbox of root.querySelectorAll('input[type="checkbox"]')) {
    const item = checkbox.closest('li');
    if (!item) {
      checkbox.remove();
      continue;
    }

    checkbox.setAttribute('disabled', '');
    checkbox.setAttribute('aria-readonly', 'true');
    checkbox.setAttribute('aria-checked', checkbox.hasAttribute('checked') ? 'true' : 'false');

    item.classList.add('task-list-item');
    item.setAttribute('data-task-state', checkbox.hasAttribute('checked') ? 'done' : 'open');

    const list = item.parentElement;
    if (list && (list.tagName.toLowerCase() === 'ul' || list.tagName.toLowerCase() === 'ol')) {
      list.classList.add('contains-task-list');
    }

    if (!checkbox.hasAttribute('aria-label')) {
      const label = (item.textContent || '').trim().slice(0, 120);
      checkbox.setAttribute(
        'aria-label',
        label.length > 0 ? `Task: ${label}` : 'Task',
      );
    }

    // A non-color-only state marker for print and high-contrast rendering.
    const state = document.createElement('span');
    state.className = 'task-list-item__state';
    state.setAttribute('aria-hidden', 'true');
    state.textContent = checkbox.hasAttribute('checked') ? 'done' : 'open';
    item.appendChild(state);

    count += 1;
  }

  return count;
}
