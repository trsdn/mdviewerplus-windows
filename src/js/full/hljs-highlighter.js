// Full preview highlighting.
//
// highlight.js replaces Prism in Full; the two engines never run together.
// The module is imported lazily and only when fenced code is present.

import hljs from 'highlight.js/lib/core';

import apache from 'highlight.js/lib/languages/apache';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import clojure from 'highlight.js/lib/languages/clojure';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import dart from 'highlight.js/lib/languages/dart';
import diff from 'highlight.js/lib/languages/diff';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import elixir from 'highlight.js/lib/languages/elixir';
import erlang from 'highlight.js/lib/languages/erlang';
import go from 'highlight.js/lib/languages/go';
import graphql from 'highlight.js/lib/languages/graphql';
import haskell from 'highlight.js/lib/languages/haskell';
import ini from 'highlight.js/lib/languages/ini';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import kotlin from 'highlight.js/lib/languages/kotlin';
import less from 'highlight.js/lib/languages/less';
import lua from 'highlight.js/lib/languages/lua';
import makefile from 'highlight.js/lib/languages/makefile';
import markdown from 'highlight.js/lib/languages/markdown';
import nginx from 'highlight.js/lib/languages/nginx';
import objectivec from 'highlight.js/lib/languages/objectivec';
import perl from 'highlight.js/lib/languages/perl';
import php from 'highlight.js/lib/languages/php';
import phpTemplate from 'highlight.js/lib/languages/php-template';
import plaintext from 'highlight.js/lib/languages/plaintext';
import powershell from 'highlight.js/lib/languages/powershell';
import python from 'highlight.js/lib/languages/python';
import pythonRepl from 'highlight.js/lib/languages/python-repl';
import r from 'highlight.js/lib/languages/r';
import ruby from 'highlight.js/lib/languages/ruby';
import rust from 'highlight.js/lib/languages/rust';
import scala from 'highlight.js/lib/languages/scala';
import scss from 'highlight.js/lib/languages/scss';
import shell from 'highlight.js/lib/languages/shell';
import sql from 'highlight.js/lib/languages/sql';
import swift from 'highlight.js/lib/languages/swift';
import typescript from 'highlight.js/lib/languages/typescript';
import vbnet from 'highlight.js/lib/languages/vbnet';
import wasm from 'highlight.js/lib/languages/wasm';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

import { sanitizeHighlightedCodeFragment } from '../security/sanitizer.js';

const REGISTRATIONS = Object.freeze({
  apache, bash, c, clojure, cpp, csharp, css, dart, diff, dockerfile, elixir, erlang, go,
  graphql, haskell, ini, java, javascript, json, kotlin, less, lua, makefile, markdown,
  nginx, objectivec, perl, php, 'php-template': phpTemplate, plaintext, powershell, python,
  'python-repl': pythonRepl, r, ruby, rust, scala, scss, shell, sql, swift, typescript,
  vbnet, wasm, xml, yaml,
});

for (const [name, definition] of Object.entries(REGISTRATIONS)) {
  hljs.registerLanguage(name, definition);
}

hljs.configure({ throwUnescapedHTML: false, ignoreUnescapedHTML: true });

export const SUPPORTED_LANGUAGES = Object.freeze(hljs.listLanguages().sort());

// Automatic detection is expensive and unreliable on short snippets, so it is
// bounded by block size and a small candidate list.
const AUTO_DETECT_MAX_CHARACTERS = 20 * 1024;
const AUTO_DETECT_CANDIDATES = Object.freeze([
  'bash', 'c', 'cpp', 'csharp', 'css', 'diff', 'go', 'ini', 'java', 'javascript', 'json',
  'markdown', 'php', 'python', 'ruby', 'rust', 'shell', 'sql', 'swift', 'typescript',
  'xml', 'yaml',
]);
const MAX_HIGHLIGHT_CHARACTERS = 400 * 1024;

export const highlighter = Object.freeze({
  id: 'highlight.js',
  languages: SUPPORTED_LANGUAGES,

  resolveLanguage(language) {
    const requested = String(language || '').toLowerCase();
    if (!requested) return '';
    return hljs.getLanguage(requested) ? requested : '';
  },

  highlight(code, language) {
    if (typeof code !== 'string' || code.length === 0 || code.length > MAX_HIGHLIGHT_CHARACTERS) {
      return null;
    }

    try {
      const resolved = this.resolveLanguage(language);
      if (resolved) {
        const result = hljs.highlight(code, { language: resolved, ignoreIllegals: true });
        return { fragment: sanitizeHighlightedCodeFragment(result.value), language: resolved };
      }

      if (language || code.length > AUTO_DETECT_MAX_CHARACTERS) return null;

      const detected = hljs.highlightAuto(code, [...AUTO_DETECT_CANDIDATES]);
      if (!detected.language || detected.relevance < 5) return null;
      return { fragment: sanitizeHighlightedCodeFragment(detected.value), language: detected.language };
    } catch {
      return null;
    }
  },
});
