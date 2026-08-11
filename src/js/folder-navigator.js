const DEFAULT_WIDTH = 240;
const MIN_WIDTH = 180;
const MAX_WIDTH = 420;
const MAX_DEPTH = 12;
const MAX_LOADED_NODES = 5000;
const WIDTH_KEY = 'folder-navigator-width';
const VISIBLE_KEY = 'folder-navigator-visible';

function clampWidth(value) {
  const parsed = Number.parseInt(value, 10);
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Number.isFinite(parsed) ? parsed : DEFAULT_WIDTH));
}

function nodeKind(node) {
  return String(node.kind || node.nodeKind || '').toLowerCase();
}

function responseNodes(response) {
  return Array.isArray(response?.nodes)
    ? response.nodes
    : Array.isArray(response?.children) ? response.children : [];
}

function parentPath(path) {
  const index = path.lastIndexOf('/');
  return index < 0 ? '' : path.slice(0, index);
}

function watcherRelativePath(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.replaceAll('\\', '/').replace(/\/+/g, '/').replace(/\/$/, '');
  if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) return null;
  const components = normalized.split('/');
  if (components.some((component) => component === '.' || component === '..')) return null;
  return normalized;
}

function basename(path) {
  return path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path;
}

function normalizeWindowsPath(path) {
  let normalized = path.replaceAll('\\', '/');
  if (/^\/\/\?\/UNC\//i.test(normalized)) {
    normalized = `//${normalized.slice('//?/UNC/'.length)}`;
  } else if (/^\/\/\?\//i.test(normalized)) {
    normalized = normalized.slice('//?/'.length);
  }
  if (normalized.startsWith('//')) {
    return `//${normalized.slice(2).replace(/\/+/g, '/')}`;
  }
  return normalized.replace(/\/+/g, '/');
}

function relativeToRoot(root, file) {
  if (!root || !file) return null;
  const normalizedRoot = normalizeWindowsPath(root).replace(/\/+$/, '');
  const normalizedFile = normalizeWindowsPath(file);
  const rootComparison = normalizedRoot.toLocaleLowerCase('en-US');
  const fileComparison = normalizedFile.toLocaleLowerCase('en-US');
  if (!fileComparison.startsWith(`${rootComparison}/`)) return null;
  const relative = normalizedFile.slice(normalizedRoot.length + 1);
  return relative && !relative.split('/').includes('..') ? relative : null;
}

function errorMessage(error) {
  if (error && typeof error === 'object') {
    if (typeof error.message === 'string') return error.message;
    if (typeof error.cannotRead === 'string') return error.cannotRead;
  }

  return String(error);
}

export async function syncFolderNavigatorAfterSaveAs(folderNavigator, completion) {
  const path = completion?.state?.path;
  if (!folderNavigator || !path) return false;
  return folderNavigator.revealAfterSaveAs(path);
}

function escapeSelector(value) {
  return globalThis.CSS?.escape ? globalThis.CSS.escape(value) : value.replace(/["\\]/g, '\\$&');
}

export function createFolderNavigator({
  invoke,
  openFile,
  chooseRoot,
  storage = globalThis.localStorage,
  document: doc = globalThis.document,
}) {
  const sidebar = doc.getElementById('folder-navigator');
  const tree = doc.getElementById('folder-navigator-tree');
  const status = doc.getElementById('folder-navigator-status');
  const rootButton = doc.getElementById('folder-navigator-root');
  const closeButton = doc.getElementById('folder-navigator-close');
  const toggleButton = doc.getElementById('folder-navigator-toggle');
  const splitter = doc.getElementById('folder-navigator-splitter');
  if (!sidebar || !tree || !status || !rootButton || !closeButton || !toggleButton || !splitter) {
    throw new Error('Folder Navigator markup is incomplete.');
  }

  let rootPath = null;
  let generation = 0;
  let watcherGeneration = 0;
  let watcherWarning = '';
  let selectedPath = '';
  let currentPath = null;
  let focusedPath = '';
  let disposed = false;
  const loaded = new Map();
  const expanded = new Set();
  const requests = new Map();

  let visible = storage?.getItem(VISIBLE_KEY) === 'true';
  let width = clampWidth(storage?.getItem(WIDTH_KEY));

  function setStatus(text) {
    status.textContent = watcherWarning ? `${text} ${watcherWarning}` : text;
  }

  function setVisible(next, { focus = true } = {}) {
    visible = Boolean(next);
    doc.body.toggleAttribute('data-folder-navigator-visible', visible);
    sidebar.hidden = !visible;
    splitter.hidden = !visible;
    toggleButton.setAttribute('aria-pressed', String(visible));
    storage?.setItem(VISIBLE_KEY, String(visible));
    if (visible && focus) {
      const target = tree.querySelector(`[data-path="${escapeSelector(focusedPath)}"]`)
        || tree.querySelector('[role="treeitem"]');
      target?.focus();
    }
  }

  function setWidth(next) {
    width = clampWidth(next);
    doc.documentElement.style.setProperty('--folder-navigator-width', `${width}px`);
    splitter.setAttribute('aria-valuenow', String(width));
    storage?.setItem(WIDTH_KEY, String(width));
  }

  function nodeCountWithout(directory) {
    let count = 0;
    for (const [path, entry] of loaded) {
      if (path !== directory) count += entry.nodes.length;
    }
    return count;
  }

  function mergeResponse(directory, response) {
    const available = Math.max(0, MAX_LOADED_NODES - nodeCountWithout(directory));
    const nodes = responseNodes(response).slice(0, available).map((node) => ({
      ...node,
      relativePath: String(node.relativePath ?? ''),
    }));
    loaded.set(directory, {
      nodes,
      truncated: Boolean(
        response?.isTruncated
        || response?.truncated
        || responseNodes(response).length > available,
      ),
    });
  }

  function visibleRows() {
    const rows = [{ relativePath: '', kind: 'directory', depth: 0, root: true }];
    function append(directory, depth) {
      if (!expanded.has(directory)) return;
      for (const node of loaded.get(directory)?.nodes || []) {
        rows.push({ ...node, depth });
        if (nodeKind(node) === 'directory') append(node.relativePath, depth + 1);
      }
    }
    append('', 1);
    return rows;
  }

  function renderStateRow(group, text, className) {
    const row = doc.createElement('div');
    row.className = `folder-tree-state ${className}`;
    row.setAttribute('role', 'note');
    row.textContent = text;
    group.append(row);
  }

  function renderChildren(group, directory, depth) {
    if (!expanded.has(directory)) return;
    const entry = loaded.get(directory);
    if (!entry) {
      renderStateRow(group, 'Loading…', 'is-loading');
      return;
    }
    if (entry.error) {
      renderStateRow(group, entry.error, 'is-error');
    }
    if (entry.nodes.length === 0) renderStateRow(group, 'Empty folder', 'is-empty');

    for (const node of entry.nodes) {
      const path = node.relativePath;
      const directoryNode = nodeKind(node) === 'directory';
      const item = doc.createElement('div');
      item.className = 'folder-tree-item';
      item.dataset.path = path;
      item.dataset.kind = directoryNode ? 'directory' : 'file';
      item.setAttribute('role', 'treeitem');
      item.setAttribute('aria-level', String(depth + 1));
      item.setAttribute('aria-selected', String(selectedPath === path));
      item.setAttribute('tabindex', focusedPath === path ? '0' : '-1');
      if (directoryNode) item.setAttribute('aria-expanded', String(expanded.has(path)));
      if (currentPath === path) {
        item.dataset.current = 'true';
        item.setAttribute('aria-current', 'page');
      }
      item.style.setProperty('--tree-depth', String(depth));

      const disclosure = doc.createElement('span');
      disclosure.className = 'folder-tree-disclosure';
      disclosure.setAttribute('aria-hidden', 'true');
      disclosure.textContent = directoryNode ? (expanded.has(path) ? '▾' : '▸') : '';
      const label = doc.createElement('span');
      label.className = 'folder-tree-label';
      label.textContent = node.name;
      item.append(disclosure, label);
      group.append(item);

      if (directoryNode && expanded.has(path)) {
        const childGroup = doc.createElement('div');
        childGroup.setAttribute('role', 'group');
        group.append(childGroup);
        renderChildren(childGroup, path, depth + 1);
      }
    }
    if (entry.truncated) renderStateRow(group, 'Additional items are not shown (folder limit reached).', 'is-truncated');
  }

  function render() {
    const scrollTop = tree.scrollTop;
    const activeItem = doc.activeElement?.closest?.('[role="treeitem"]');
    const restoreFocusPath = activeItem && tree.contains(activeItem)
      ? activeItem.dataset.path
      : null;
    tree.replaceChildren();
    if (!rootPath) {
      renderStateRow(tree, 'No folder is open. Choose Open Folder to authorize one.', 'is-unavailable');
      setStatus('Folder Navigator unavailable until a folder is opened.');
      return;
    }

    const root = doc.createElement('div');
    root.className = 'folder-tree-item folder-tree-root';
    root.dataset.path = '';
    root.dataset.kind = 'directory';
    root.setAttribute('role', 'treeitem');
    root.setAttribute('aria-level', '1');
    root.setAttribute('aria-expanded', String(expanded.has('')));
    root.setAttribute('aria-selected', String(selectedPath === ''));
    root.setAttribute('tabindex', focusedPath === '' ? '0' : '-1');
    root.innerHTML = `<span class="folder-tree-disclosure" aria-hidden="true">${expanded.has('') ? '▾' : '▸'}</span>`;
    const rootLabel = doc.createElement('span');
    rootLabel.className = 'folder-tree-label';
    rootLabel.textContent = basename(rootPath);
    root.append(rootLabel);
    tree.append(root);

    if (expanded.has('')) {
      const group = doc.createElement('div');
      group.setAttribute('role', 'group');
      tree.append(group);
      renderChildren(group, '', 1);
    }
    tree.scrollTop = scrollTop;
    if (restoreFocusPath != null) {
      tree.querySelector(`[data-path="${escapeSelector(restoreFocusPath)}"]`)
        ?.focus({ preventScroll: true });
    }
  }

  async function load(directory, { refresh = false } = {}) {
    if (!rootPath || disposed) return false;
    if (loaded.has(directory) && !refresh) return true;
    const requestGeneration = generation;
    const token = (requests.get(directory) || 0) + 1;
    requests.set(directory, token);
    if (!refresh) {
      loaded.delete(directory);
      render();
      setStatus(`Loading ${directory || basename(rootPath)}…`);
    }
    try {
      const response = await invoke('list_folder_children', {
        rootPath,
        relativeDirectory: directory,
        depth: directory ? directory.split('/').length : 0,
      });
      if (disposed || requestGeneration !== generation || requests.get(directory) !== token) {
        return false;
      }
      mergeResponse(directory, response);
      render();
      const entry = loaded.get(directory);
      setStatus(entry.truncated
        ? 'Folder loaded; additional items are not shown.'
        : `${entry.nodes.length} item${entry.nodes.length === 1 ? '' : 's'} loaded.`);
      return true;
    } catch (error) {
      if (disposed || requestGeneration !== generation || requests.get(directory) !== token) {
        return false;
      }
      loaded.set(directory, {
        ...(loaded.get(directory) || { nodes: [] }),
        error: `Could not load folder: ${errorMessage(error)}`,
      });
      render();
      setStatus(loaded.get(directory).error);
      return false;
    }
  }

  async function setRoot(path) {
    if (!path || disposed) return false;
    generation += 1;
    requests.clear();
    loaded.clear();
    expanded.clear();
    selectedPath = '';
    focusedPath = '';
    currentPath = null;
    watcherWarning = '';
    rootPath = path;
    rootButton.textContent = basename(path);
    rootButton.title = path;
    expanded.add('');
    setVisible(true, { focus: false });
    render();
    try {
      watcherGeneration = await invoke('start_folder_tree_watcher', { rootPath });
    } catch (error) {
      watcherGeneration = 0;
      watcherWarning = `Live folder refresh is unavailable: ${errorMessage(error)}`;
    }
    const loadedRoot = await load('');
    tree.querySelector('[role="treeitem"]')?.focus();
    return loadedRoot;
  }

  async function expand(path) {
    if ((path ? path.split('/').length : 0) >= MAX_DEPTH) {
      setStatus('The maximum folder depth of 12 has been reached.');
      return false;
    }
    expanded.add(path);
    render();
    return load(path);
  }

  function collapse(path) {
    expanded.delete(path);
    render();
  }

  async function togglePath(path) {
    if (expanded.has(path)) collapse(path);
    else await expand(path);
  }

  async function activate(path) {
    const row = tree.querySelector(`[data-path="${escapeSelector(path)}"]`);
    if (row?.dataset.kind === 'directory') return togglePath(path);
    const activationGeneration = generation;
    selectedPath = path;
    render();
    setStatus(`Opening ${basename(path)}…`);
    try {
      const resolved = await invoke('resolve_folder_markdown', {
        rootPath,
        relativeFile: path,
      });
      if (activationGeneration !== generation) return false;
      const opened = await openFile(resolved);
      if (opened) {
        currentPath = path;
        selectedPath = path;
        render();
        setStatus(`${basename(path)} opened.`);
      } else {
        selectedPath = currentPath || '';
        render();
        setStatus('The current document was kept.');
      }
      return opened;
    } catch (error) {
      selectedPath = currentPath || '';
      render();
      setStatus(`Could not open file: ${errorMessage(error)}`);
      return false;
    }
  }

  function focusPath(path) {
    focusedPath = path;
    for (const item of tree.querySelectorAll('[role="treeitem"]')) {
      item.tabIndex = item.dataset.path === path ? 0 : -1;
    }
    tree.querySelector(`[data-path="${escapeSelector(path)}"]`)?.focus();
  }

  async function handleKeydown(event) {
    const item = event.target.closest?.('[role="treeitem"]');
    if (!item) return;
    const path = item.dataset.path;
    const rows = visibleRows();
    const index = rows.findIndex((row) => row.relativePath === path);
    let destination;
    if (event.key === 'ArrowDown') destination = rows[Math.min(rows.length - 1, index + 1)];
    else if (event.key === 'ArrowUp') destination = rows[Math.max(0, index - 1)];
    else if (event.key === 'Home') destination = rows[0];
    else if (event.key === 'End') destination = rows.at(-1);
    else if (event.key === 'ArrowRight' && item.dataset.kind === 'directory') {
      if (!expanded.has(path)) await expand(path);
      else destination = rows[index + 1];
    } else if (event.key === 'ArrowLeft') {
      if (item.dataset.kind === 'directory' && expanded.has(path)) collapse(path);
      else destination = rows.find((row) => row.relativePath === parentPath(path));
    } else if (event.key === 'Enter' || event.key === ' ') {
      await activate(path);
    } else {
      return;
    }
    event.preventDefault();
    if (destination) focusPath(destination.relativePath);
  }

  async function revealCurrent(filePath, { refreshParent = false } = {}) {
    const relative = relativeToRoot(rootPath, filePath);
    if (!relative) {
      generation += 1;
      requests.clear();
      loaded.clear();
      expanded.clear();
      rootPath = null;
      currentPath = null;
      watcherWarning = '';
      rootButton.textContent = 'Open Folder…';
      rootButton.removeAttribute('title');
      try {
        await invoke('stop_folder_tree_watcher');
      } catch {
        // The root may not have had an active watcher.
      }
      render();
      setStatus('The current document is outside the authorized root. Open a folder to continue.');
      return false;
    }
    const parts = relative.split('/');
    if (parts.length - 1 > MAX_DEPTH) {
      setStatus('The current document is deeper than the 12-folder reveal limit.');
      return false;
    }
    let directory = '';
    expanded.add('');
    for (const part of parts.slice(0, -1)) {
      if (!await load(directory)) return false;
      directory = directory ? `${directory}/${part}` : part;
      const exists = loaded.get(parentPath(directory))?.nodes.some(
        (node) => node.relativePath === directory && nodeKind(node) === 'directory',
      );
      if (!exists) return false;
      expanded.add(directory);
    }
    if (!await load(directory, { refresh: refreshParent })) return false;
    if (!loaded.get(directory)?.nodes.some((node) => node.relativePath === relative)) return false;
    currentPath = relative;
    selectedPath = relative;
    focusedPath = relative;
    render();
    tree.querySelector(`[data-path="${escapeSelector(relative)}"]`)?.scrollIntoView?.({ block: 'nearest' });
    return true;
  }

  async function refreshChanged(payload = {}) {
    if (!rootPath || payload.generation !== watcherGeneration) return;
    if (payload.terminal || payload.rootUnavailable) {
      generation += 1;
      requests.clear();
      loaded.clear();
      expanded.clear();
      rootPath = null;
      watcherGeneration = 0;
      watcherWarning = '';
      selectedPath = '';
      currentPath = null;
      focusedPath = '';
      rootButton.textContent = 'Open Folder…';
      rootButton.removeAttribute('title');
      try {
        await invoke('stop_folder_tree_watcher');
      } catch {
        // A terminal native watcher may already have stopped itself.
      }
      render();
      setStatus(
        'The folder navigator root was moved, deleted, or is unavailable. Choose Open Folder… to continue.',
      );
      return;
    }

    const directories = new Set(payload.rescanRequired ? loaded.keys() : []);
    if (!payload.rescanRequired) {
      // `affectedPaths` is the native serde field; accept `relativePaths` as the
      // platform-neutral contract name used by integration callers.
      for (const value of payload.affectedPaths || payload.relativePaths || []) {
        const path = watcherRelativePath(value);
        if (path == null) continue;
        if (loaded.has(path)) directories.add(path);
        const parent = parentPath(path);
        if (loaded.has(parent)) directories.add(parent);
      }
    }
    if (directories.size === 0) return;
    const requestGeneration = generation;
    await Promise.all([...directories].map((directory) => load(directory, { refresh: true })));
    if (requestGeneration === generation && currentPath) render();
  }

  async function dispose() {
    disposed = true;
    generation += 1;
    try {
      await invoke('stop_folder_tree_watcher');
    } catch {
      // The native watcher may not have started.
    }
  }

  rootButton.addEventListener('click', () => chooseRoot());
  closeButton.addEventListener('click', () => setVisible(false, { focus: false }));
  toggleButton.addEventListener('click', () => setVisible(!visible));
  tree.addEventListener('click', (event) => {
    const item = event.target.closest?.('[role="treeitem"]');
    if (!item) return;
    focusedPath = item.dataset.path;
    item.focus();
    void activate(item.dataset.path);
  });
  tree.addEventListener('keydown', (event) => { void handleKeydown(event); });

  let dragStart = null;
  splitter.addEventListener('pointerdown', (event) => {
    dragStart = { x: event.clientX, width };
    splitter.setPointerCapture?.(event.pointerId);
  });
  splitter.addEventListener('pointermove', (event) => {
    if (dragStart) setWidth(dragStart.width + event.clientX - dragStart.x);
  });
  splitter.addEventListener('pointerup', () => { dragStart = null; });
  splitter.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') setWidth(width - 10);
    else if (event.key === 'ArrowRight') setWidth(width + 10);
    else if (event.key === 'Home') setWidth(MIN_WIDTH);
    else if (event.key === 'End') setWidth(MAX_WIDTH);
    else return;
    event.preventDefault();
  });

  setWidth(width);
  setVisible(visible, { focus: false });
  render();

  return {
    activate,
    dispose,
    getState: () => ({
      rootPath,
      visible,
      width,
      expanded: new Set(expanded),
      loaded: new Map(loaded),
      currentPath,
      selectedPath,
      generation,
      watcherGeneration,
    }),
    openRoot: chooseRoot,
    refreshChanged,
    revealAfterSaveAs: (path) => revealCurrent(path, { refreshParent: true }),
    revealCurrent,
    setCurrentFile: revealCurrent,
    setRoot,
    setVisible,
    setWidth,
    toggle: () => setVisible(!visible),
  };
}

export const FOLDER_NAVIGATOR_LIMITS = Object.freeze({
  defaultWidth: DEFAULT_WIDTH,
  minWidth: MIN_WIDTH,
  maxWidth: MAX_WIDTH,
  maxDepth: MAX_DEPTH,
  maxLoadedNodes: MAX_LOADED_NODES,
});
