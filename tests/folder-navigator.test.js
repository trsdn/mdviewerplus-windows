import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { JSDOM } from 'jsdom';

import {
  createFolderNavigator,
  FOLDER_NAVIGATOR_LIMITS,
  syncFolderNavigatorAfterSaveAs,
} from '../src/js/folder-navigator.js';
import { loadedDocument, saveAsCompletion } from '../src/js/document-policy.js';

const htmlPath = new URL('../src/web/index.html', import.meta.url);

async function fixture({ invoke, openFile = async () => true } = {}) {
  const dom = new JSDOM(await readFile(htmlPath, 'utf8'), {
    url: 'https://tauri.localhost/',
    pretendToBeVisual: true,
  });
  const navigator = createFolderNavigator({
    document: dom.window.document,
    storage: dom.window.localStorage,
    invoke: invoke || (async (command) => {
      if (command === 'start_folder_tree_watcher') return 1;
      if (command === 'list_folder_children') return { children: [], isTruncated: false };
      return undefined;
    }),
    openFile,
    chooseRoot: async () => {},
  });
  return { dom, document: dom.window.document, navigator };
}

const rootChildren = {
  children: [
    {
      id: 'guides',
      name: 'guides',
      relativePath: 'guides',
      kind: 'directory',
      depth: 1,
      isExpandable: true,
      isTruncated: false,
    },
    {
      id: 'README.md',
      name: 'README.md',
      relativePath: 'README.md',
      kind: 'file',
      depth: 1,
      isExpandable: false,
      isTruncated: false,
    },
  ],
  isTruncated: false,
};

test('renders an accessible, collapsed-by-default tree with persisted bounded width', async () => {
  const { document, dom, navigator } = await fixture({
    invoke: async (command) => {
      if (command === 'start_folder_tree_watcher') return 7;
      if (command === 'list_folder_children') return rootChildren;
    },
  });

  assert.equal(document.getElementById('folder-navigator').hidden, true);
  assert.deepEqual(FOLDER_NAVIGATOR_LIMITS, {
    defaultWidth: 240,
    minWidth: 180,
    maxWidth: 420,
    maxDepth: 12,
    maxLoadedNodes: 5000,
  });

  await navigator.setRoot('C:\\notes');
  const tree = document.getElementById('folder-navigator-tree');
  assert.equal(tree.getAttribute('role'), 'tree');
  assert.equal(tree.querySelectorAll('[role="treeitem"]').length, 3);
  assert.equal(tree.querySelector('[data-path="guides"]').getAttribute('aria-expanded'), 'false');
  assert.equal(tree.querySelector('[data-path="README.md"]').getAttribute('aria-selected'), 'false');

  navigator.setWidth(999);
  assert.equal(navigator.getState().width, 420);
  assert.equal(dom.window.localStorage.getItem('folder-navigator-width'), '420');
  navigator.setVisible(false);
  assert.equal(dom.window.localStorage.getItem('folder-navigator-visible'), 'false');
});

test('loads only an expanded directory and supports tree keyboard navigation', async () => {
  const calls = [];
  const { document, dom, navigator } = await fixture({
    invoke: async (command, args) => {
      if (command === 'start_folder_tree_watcher') return 1;
      if (command === 'list_folder_children') {
        calls.push(args.relativeDirectory);
        return args.relativeDirectory === 'guides'
          ? {
            children: [{
              id: 'guides/start.md',
              name: 'start.md',
              relativePath: 'guides/start.md',
              kind: 'file',
              depth: 2,
              isExpandable: false,
              isTruncated: false,
            }],
          }
          : rootChildren;
      }
    },
  });
  await navigator.setRoot('C:\\notes');

  const guides = document.querySelector('[data-path="guides"]');
  guides.focus();
  guides.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
    key: 'ArrowRight',
    bubbles: true,
    cancelable: true,
  }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(calls, ['', 'guides']);
  assert.equal(document.querySelector('[data-path="guides"]').getAttribute('aria-expanded'), 'true');

  document.querySelector('[data-path="guides"]').dispatchEvent(new dom.window.KeyboardEvent(
    'keydown',
    { key: 'ArrowRight', bubbles: true, cancelable: true },
  ));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(document.activeElement.dataset.path, 'guides/start.md');
});

test('directory rerenders preserve focus for keyboard and mouse toggles', async () => {
  const { document, dom, navigator } = await fixture({
    invoke: async (command, args) => {
      if (command === 'start_folder_tree_watcher') return 6;
      if (command === 'list_folder_children') {
        return args.relativeDirectory === 'guides'
          ? {
            children: [{
              name: 'start.md',
              relativePath: 'guides/start.md',
              kind: 'file',
            }],
          }
          : rootChildren;
      }
    },
  });
  await navigator.setRoot('C:\\notes');

  let guides = document.querySelector('[data-path="guides"]');
  guides.focus();
  guides.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
    key: 'ArrowRight',
    bubbles: true,
    cancelable: true,
  }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(document.activeElement.dataset.path, 'guides');

  guides = document.querySelector('[data-path="guides"]');
  guides.querySelector('.folder-tree-disclosure').click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(document.activeElement.dataset.path, 'guides');
  assert.equal(
    document.querySelector('[data-path="guides"]').getAttribute('aria-expanded'),
    'false',
  );
});

test('rejects stale root responses and refreshes loaded directories only', async () => {
  let resolveOld;
  const oldResponse = new Promise((resolve) => { resolveOld = resolve; });
  const calls = [];
  const { document, navigator } = await fixture({
    invoke: async (command, args) => {
      if (command === 'start_folder_tree_watcher') return args.rootPath === 'C:\\old' ? 1 : 2;
      if (command === 'list_folder_children') {
        calls.push([args.rootPath, args.relativeDirectory]);
        if (args.rootPath === 'C:\\old') return oldResponse;
        return { children: [], isTruncated: false };
      }
    },
  });

  const loadingOld = navigator.setRoot('C:\\old');
  await Promise.resolve();
  const loadingNew = navigator.setRoot('C:\\new');
  resolveOld(rootChildren);
  await Promise.all([loadingOld, loadingNew]);
  assert.equal(navigator.getState().rootPath, 'C:\\new');
  assert.equal(document.querySelector('[data-path="README.md"]'), null);

  calls.length = 0;
  await navigator.refreshChanged({ generation: 2, relativePaths: ['README.md'] });
  assert.deepEqual(calls, [['C:\\new', '']]);
});

test('shows truncation and errors without clearing a previously loaded tree', async () => {
  let failRefresh = false;
  const { document, navigator } = await fixture({
    invoke: async (command) => {
      if (command === 'start_folder_tree_watcher') return 3;
      if (command === 'list_folder_children') {
        if (failRefresh) throw new Error('access denied');
        return { ...rootChildren, isTruncated: true };
      }
    },
  });
  await navigator.setRoot('C:\\notes');
  assert.match(document.body.textContent, /Additional items are not shown/);

  failRefresh = true;
  await navigator.refreshChanged({ generation: 3, relativePaths: ['README.md'] });
  assert.match(document.body.textContent, /Could not load folder: access denied/);
});

test('watcher refresh selects only loaded directories directly affected by nested paths', async () => {
  const calls = [];
  const { navigator } = await fixture({
    invoke: async (command, args) => {
      if (command === 'start_folder_tree_watcher') return 8;
      if (command === 'list_folder_children') {
        calls.push(args.relativeDirectory);
        if (args.relativeDirectory === 'guides') {
          return {
            children: [
              {
                name: 'advanced',
                relativePath: 'guides/advanced',
                kind: 'directory',
              },
              {
                name: 'start.md',
                relativePath: 'guides/start.md',
                kind: 'file',
              },
            ],
          };
        }
        if (args.relativeDirectory === 'guides/advanced') {
          return {
            children: [{
              name: 'deep.md',
              relativePath: 'guides/advanced/deep.md',
              kind: 'file',
            }],
          };
        }
        return rootChildren;
      }
    },
  });
  await navigator.setRoot('C:\\notes');
  await navigator.revealCurrent('C:\\notes\\guides\\advanced\\deep.md');

  calls.length = 0;
  await navigator.refreshChanged({
    generation: 8,
    affectedPaths: ['guides/start.md', 'guides/advanced/deep.md'],
  });
  assert.deepEqual(calls.sort(), ['guides', 'guides/advanced']);
});

test('watcher ignores unrelated unopened paths and stale generations', async () => {
  const calls = [];
  const { navigator } = await fixture({
    invoke: async (command, args) => {
      if (command === 'start_folder_tree_watcher') return 9;
      if (command === 'list_folder_children') {
        calls.push(args.relativeDirectory);
        return rootChildren;
      }
    },
  });
  await navigator.setRoot('C:\\notes');

  calls.length = 0;
  await navigator.refreshChanged({
    generation: 9,
    relativePaths: ['unopened/nested.md'],
  });
  await navigator.refreshChanged({
    generation: 8,
    relativePaths: ['README.md'],
  });
  assert.deepEqual(calls, []);
});

test('rescan recovery refreshes every loaded directory without opening lazy branches', async () => {
  const calls = [];
  const unopened = {
    name: 'unopened',
    relativePath: 'unopened',
    kind: 'directory',
  };
  const { navigator } = await fixture({
    invoke: async (command, args) => {
      if (command === 'start_folder_tree_watcher') return 11;
      if (command === 'list_folder_children') {
        calls.push(args.relativeDirectory);
        if (args.relativeDirectory === 'guides') {
          return {
            children: [{
              name: 'start.md',
              relativePath: 'guides/start.md',
              kind: 'file',
            }],
          };
        }
        return { ...rootChildren, children: [...rootChildren.children, unopened] };
      }
    },
  });
  await navigator.setRoot('C:\\notes');
  await navigator.revealCurrent('C:\\notes\\guides\\start.md');

  calls.length = 0;
  await navigator.refreshChanged({
    generation: 11,
    affectedPaths: [],
    rootUnavailable: false,
    rescanRequired: true,
  });
  assert.deepEqual(calls.sort(), ['', 'guides']);
  assert.equal(calls.includes('unopened'), false);
});

test('rescan recovery rejects stale generations and does nothing without a root', async () => {
  const calls = [];
  const { navigator } = await fixture({
    invoke: async (command, args) => {
      if (command === 'start_folder_tree_watcher') return 12;
      if (command === 'list_folder_children') {
        calls.push(args.relativeDirectory);
        return rootChildren;
      }
    },
  });

  await navigator.refreshChanged({
    generation: 0,
    affectedPaths: [],
    rootUnavailable: false,
    rescanRequired: true,
  });
  assert.deepEqual(calls, []);

  await navigator.setRoot('C:\\notes');
  calls.length = 0;
  await navigator.refreshChanged({
    generation: 11,
    affectedPaths: [],
    rootUnavailable: false,
    rescanRequired: true,
  });
  assert.deepEqual(calls, []);
});

test('terminal root deletion clears loaded state but keeps the unavailable sidebar visible', async () => {
  const calls = [];
  const { document, navigator } = await fixture({
    invoke: async (command) => {
      calls.push(command);
      if (command === 'start_folder_tree_watcher') return 10;
      if (command === 'list_folder_children') return rootChildren;
    },
  });
  await navigator.setRoot('C:\\notes');

  await navigator.refreshChanged({
    generation: 10,
    relativePaths: [],
    rootUnavailable: true,
  });

  const state = navigator.getState();
  assert.equal(state.rootPath, null);
  assert.equal(state.loaded.size, 0);
  assert.equal(state.watcherGeneration, 0);
  assert.equal(state.visible, true);
  assert.equal(document.getElementById('folder-navigator').hidden, false);
  assert.match(
    document.getElementById('folder-navigator-status').textContent,
    /root was moved, deleted, or is unavailable.*Open Folder/,
  );
  assert.ok(calls.includes('stop_folder_tree_watcher'));
});

test('file activation resolves only a relative node and restores selection when dirty open cancels', async () => {
  const invocations = [];
  const { document, navigator } = await fixture({
    invoke: async (command, args) => {
      invocations.push([command, args]);
      if (command === 'start_folder_tree_watcher') return 1;
      if (command === 'list_folder_children') return rootChildren;
      if (command === 'resolve_folder_markdown') return 'C:\\notes\\README.md';
    },
    openFile: async () => false,
  });
  await navigator.setRoot('C:\\notes');
  assert.equal(await navigator.activate('README.md'), false);
  assert.deepEqual(
    invocations.find(([command]) => command === 'resolve_folder_markdown')[1],
    { rootPath: 'C:\\notes', relativeFile: 'README.md' },
  );
  assert.equal(navigator.getState().selectedPath, '');
  assert.equal(document.querySelector('[data-path="README.md"]').getAttribute('aria-selected'), 'false');
  assert.ok(document.querySelectorAll('[data-support-link]').length > 0);
});

test('reveals a current file lazily and resets an out-of-root document', async () => {
  const calls = [];
  const { navigator } = await fixture({
    invoke: async (command, args) => {
      if (command === 'start_folder_tree_watcher') return 4;
      if (command === 'list_folder_children') {
        calls.push(args.relativeDirectory);
        if (args.relativeDirectory === 'guides') {
          return {
            children: [{
              name: 'start.md',
              relativePath: 'guides/start.md',
              kind: 'file',
            }],
          };
        }
        return rootChildren;
      }
    },
  });
  await navigator.setRoot('C:\\notes');
  assert.equal(await navigator.revealCurrent('C:\\notes\\guides\\start.md'), true);
  assert.equal(navigator.getState().currentPath, 'guides/start.md');
  assert.deepEqual(calls, ['', 'guides']);

  assert.equal(await navigator.setCurrentFile('D:\\other\\outside.md'), false);
  assert.equal(navigator.getState().rootPath, null);
});

test('treats extended-length drive and UNC paths as their dialog-path equivalents', async () => {
  const { navigator } = await fixture({
    invoke: async (command) => {
      if (command === 'start_folder_tree_watcher') return 5;
      if (command === 'list_folder_children') return rootChildren;
    },
  });

  await navigator.setRoot('C:\\notes');
  assert.equal(await navigator.revealCurrent('\\\\?\\C:\\notes\\README.md'), true);
  assert.equal(navigator.getState().currentPath, 'README.md');

  await navigator.setRoot('\\\\server\\share\\notes');
  assert.equal(
    await navigator.revealCurrent('\\\\?\\UNC\\server\\share\\notes\\README.md'),
    true,
  );
  assert.equal(navigator.getState().currentPath, 'README.md');
});

test('reports watcher startup failure while retaining successfully loaded root contents', async () => {
  const { document, navigator } = await fixture({
    invoke: async (command) => {
      if (command === 'start_folder_tree_watcher') throw new Error('watch permission denied');
      if (command === 'list_folder_children') return rootChildren;
    },
  });

  assert.equal(await navigator.setRoot('C:\\notes'), true);
  assert.ok(document.querySelector('[data-path="README.md"]'));
  assert.match(
    document.getElementById('folder-navigator-status').textContent,
    /2 items loaded\. Live folder refresh is unavailable: watch permission denied/,
  );
});

test('Save As refreshes cached destination children before revealing the new file', async () => {
  const calls = [];
  let saved = false;
  const oldFile = {
    name: 'old.md',
    relativePath: 'old.md',
    kind: 'file',
  };
  const newFile = {
    name: 'new.md',
    relativePath: 'new.md',
    kind: 'file',
  };
  const { document, navigator } = await fixture({
    invoke: async (command, args) => {
      if (command === 'start_folder_tree_watcher') return 13;
      if (command === 'list_folder_children') {
        calls.push(args.relativeDirectory);
        return { children: saved ? [oldFile, newFile] : [oldFile] };
      }
    },
  });
  await navigator.setRoot('C:\\notes');
  assert.equal(navigator.getState().loaded.get('').nodes.length, 1);

  saved = true;
  const completion = saveAsCompletion(
    loadedDocument('C:\\notes\\old.md', 'old'),
    'C:\\notes\\new.md',
    'new',
    'new',
  );
  assert.equal(await syncFolderNavigatorAfterSaveAs(navigator, completion), true);

  assert.deepEqual(calls, ['', '']);
  assert.equal(navigator.getState().currentPath, 'new.md');
  assert.equal(
    document.querySelector('[data-path="new.md"]').getAttribute('aria-current'),
    'page',
  );

  const mainSource = await readFile(new URL('../src/js/main.js', import.meta.url), 'utf8');
  assert.match(
    mainSource,
    /await syncFolderNavigatorAfterSaveAs\(folderNavigator, completion\)/,
  );
});
