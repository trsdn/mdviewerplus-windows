// CodeMirror 6 editor setup with markdown highlighting + format commands

import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection, highlightSpecialChars } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { searchKeymap, openSearchPanel } from '@codemirror/search';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { tags } from '@lezer/highlight';

let editorView = null;
let fontSizeCompartment = new Compartment();
let onChangeCallback = null;

const markdownHighlightStyle = HighlightStyle.define([
  { tag: tags.heading, color: 'var(--theme-link)', fontWeight: '700' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: [tags.link, tags.url], color: 'var(--theme-link)' },
  {
    tag: tags.monospace,
    color: 'var(--theme-code-foreground)',
    backgroundColor: 'var(--theme-code-background)',
    borderRadius: '3px',
  },
  { tag: tags.quote, color: 'var(--theme-blockquote-foreground)' },
  { tag: tags.list, color: 'var(--theme-link)' },
  { tag: tags.contentSeparator, color: 'var(--theme-link)' },
]);

export function initEditor(container, onChange) {
  onChangeCallback = onChange;

  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged && onChangeCallback) {
      onChangeCallback(update.state.doc.toString());
    }
  });

  const state = EditorState.create({
    doc: '',
    extensions: [
      lineNumbers(),
      highlightActiveLine(),
      highlightSpecialChars(),
      drawSelection(),
      history(),
      markdown({ base: markdownLanguage }),
      syntaxHighlighting(markdownHighlightStyle),
      fontSizeCompartment.of(EditorView.theme({
        '.cm-content': { fontSize: '14px' },
        '.cm-gutters': { fontSize: '14px' },
      })),
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
      ]),
      updateListener,
      EditorView.lineWrapping,
    ],
  });

  editorView = new EditorView({
    state,
    parent: container,
  });

  return editorView;
}

export function getEditorView() {
  return editorView;
}

export function setContent(text) {
  if (!editorView) return;
  editorView.dispatch({
    changes: { from: 0, to: editorView.state.doc.length, insert: text },
  });
}

export function getContent() {
  if (!editorView) return '';
  return editorView.state.doc.toString();
}

export function setFontSize(size) {
  if (!editorView) return;
  editorView.dispatch({
    effects: fontSizeCompartment.reconfigure(EditorView.theme({
      '.cm-content': { fontSize: size + 'px' },
      '.cm-gutters': { fontSize: size + 'px' },
    })),
  });
}

export function focus() {
  if (editorView) editorView.focus();
}

export function openFind() {
  if (editorView) openSearchPanel(editorView);
}

export function moveCaretToLine(lineNumber) {
  if (!editorView || !Number.isInteger(lineNumber) || lineNumber < 1) return false;
  const bounded = Math.min(lineNumber, editorView.state.doc.lines);
  const line = editorView.state.doc.line(bounded);
  editorView.dispatch({
    selection: { anchor: line.from },
    effects: EditorView.scrollIntoView(line.from, { y: 'start' }),
  });
  return true;
}

// Format commands

function wrapSelection(before, after) {
  if (!editorView) return;
  const { from, to } = editorView.state.selection.main;
  const selected = editorView.state.sliceDoc(from, to);
  const replacement = before + selected + (after || before);
  editorView.dispatch({
    changes: { from, to, insert: replacement },
    selection: { anchor: from + before.length, head: from + before.length + selected.length },
  });
  editorView.focus();
}

export function formatBold() {
  wrapSelection('**', '**');
}

export function formatItalic() {
  wrapSelection('_', '_');
}

export function formatLink() {
  if (!editorView) return;
  const { from, to } = editorView.state.selection.main;
  const selected = editorView.state.sliceDoc(from, to);
  const replacement = '[' + selected + '](url)';
  editorView.dispatch({
    changes: { from, to, insert: replacement },
    // Select "url" so user can type over it
    selection: { anchor: from + selected.length + 3, head: from + selected.length + 6 },
  });
  editorView.focus();
}

export function getEditorElement() {
  return document.getElementById('editor');
}
