// Lite preview highlighting.
//
// A custom Prism build limited to the languages promised for Lite. It is
// imported lazily, only when a rendered document actually contains a fenced
// code block, and its output always passes through the constrained highlight
// sanitizer before insertion.

import './prism-manual.js';
import Prism from 'prismjs/components/prism-core.js';

import { sanitizeHighlightedCodeFragment } from '../security/sanitizer.js';

const PUNCTUATION = /[{}\[\];(),.:]/;
const NUMBER = /\b(?:0x[\da-f]+|0b[01]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?)\b/i;
const OPERATOR = /[-+*/%=&|!<>]=?|\?|\^|~/;
const CODE_KEYWORDS = /\b(?:async|await|break|case|catch|class|const|continue|default|else|enum|export|extends|false|finally|fn|for|func|function|if|import|in|let|match|new|null|pub|return|static|struct|super|switch|throw|trait|true|try|type|var|while)\b/;
const COMMON = Object.freeze({
  comment: [
    { pattern: /\/\*[\s\S]*?\*\//, greedy: true },
    { pattern: /(^|[^\\:])\/\/.*/, lookbehind: true, greedy: true },
  ],
  string: { pattern: /(["'`])(?:\\[\s\S]|(?!\1)[^\\])*\1/, greedy: true },
  number: NUMBER,
  boolean: /\b(?:false|true|null|nil|none)\b/i,
  operator: OPERATOR,
  punctuation: PUNCTUATION,
});

function language(keyword, extra = {}) {
  return {
    ...COMMON,
    keyword,
    ...extra,
  };
}

Prism.languages.markup = {
  comment: { pattern: /<!--(?:(?!<!--)[\s\S])*?-->/, greedy: true },
  tag: { pattern: /<\/?[a-z][^<>]*>/i, greedy: true },
  entity: /&#?[\da-z]{1,8};/i,
};
Prism.languages.css = {
  comment: { pattern: /\/\*[\s\S]*?\*\//, greedy: true },
  selector: /[^{}\s][^{}]*(?=\s*\{)/,
  property: /(?:^|[{\s;])[\w-]+(?=\s*:)/,
  string: COMMON.string,
  number: NUMBER,
  punctuation: /[(){}:;,]/,
};
Prism.languages.javascript = language(CODE_KEYWORDS);
Prism.languages.typescript = Prism.languages.javascript;
Prism.languages.json = {
  property: { pattern: /(^|[,{]\s*)"(?:\\.|[^"\\])*"(?=\s*:)/, lookbehind: true, greedy: true },
  string: { pattern: /"(?:\\.|[^"\\])*"(?!\s*:)/, greedy: true },
  comment: /\/\/.*|\/\*[\s\S]*?\*\//,
  number: NUMBER,
  punctuation: /[{}[\],]/,
  operator: /:/,
  boolean: /\b(?:false|null|true)\b/,
};
Prism.languages.bash = language(
  CODE_KEYWORDS,
  {
    comment: { pattern: /(^|[^"{\\$])#.*/, lookbehind: true, greedy: true },
    variable: /\$(?:\w+|\{[^}]+\})/,
  },
);
Prism.languages.python = language(
  CODE_KEYWORDS,
  { comment: { pattern: /(^|[^\\])#.*/, lookbehind: true, greedy: true } },
);
Prism.languages.rust = language(CODE_KEYWORDS);
Prism.languages.swift = language(CODE_KEYWORDS);

export const SUPPORTED_LANGUAGES = Object.freeze([
  'bash', 'css', 'html', 'javascript', 'json', 'python', 'rust', 'swift', 'typescript',
]);

const ALIASES = Object.freeze({
  bash: 'bash',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  console: 'bash',
  css: 'css',
  html: 'markup',
  xml: 'markup',
  markup: 'markup',
  js: 'javascript',
  javascript: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  jsonc: 'json',
  py: 'python',
  python: 'python',
  rs: 'rust',
  rust: 'rust',
  swift: 'swift',
  ts: 'typescript',
  tsx: 'typescript',
  typescript: 'typescript',
});

const MAX_HIGHLIGHT_CHARACTERS = 200 * 1024;

export const highlighter = Object.freeze({
  id: 'prism',
  languages: SUPPORTED_LANGUAGES,

  resolveLanguage(language) {
    return ALIASES[String(language || '').toLowerCase()] || '';
  },

  /**
   * Returns a sanitized fragment, or null when the language is unknown, the
   * block is too large, or Prism fails. Callers keep the plain text in that
   * case, so highlighting can never lose code.
   */
  highlight(code, language) {
    const resolved = this.resolveLanguage(language);
    if (!resolved || typeof code !== 'string' || code.length > MAX_HIGHLIGHT_CHARACTERS) return null;

    const grammar = Prism.languages[resolved];
    if (!grammar) return null;

    try {
      const html = Prism.highlight(code, grammar, resolved);
      return { fragment: sanitizeHighlightedCodeFragment(html), language: resolved };
    } catch {
      return null;
    }
  },
});
