import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  APPEARANCE_MODES,
  DEFAULT_DARK_THEME,
  DEFAULT_LIGHT_THEME,
  THEMES,
  THEME_TOKENS,
  cssVariablesForPalette,
  resolveTheme,
  themesForCategory,
} from '../src/js/theme-registry.js';

const expectedIds = [
  'github-light',
  'solarized-light',
  'sepia',
  'github-dark',
  'solarized-dark',
  'dracula',
  'monokai',
  'nord',
];

function relativeLuminance(hex) {
  const channels = hex.slice(1).match(/.{2}/g).map((value) => {
    const channel = Number.parseInt(value, 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
}

function contrastRatio(foreground, background) {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

test('registry exactly exposes the contract IDs and semantic tokens', () => {
  assert.deepEqual(THEMES.map(({ id }) => id), expectedIds);
  assert.deepEqual(APPEARANCE_MODES, ['system', 'light', 'dark']);
  for (const theme of THEMES) {
    assert.deepEqual(Object.keys(theme.colors), THEME_TOKENS);
    assert.match(theme.colors.background, /^#[0-9a-f]{6}$/);
  }
});

test('registry includes the approved accessibility-corrected colors', () => {
  const colors = Object.fromEntries(THEMES.map((theme) => [theme.id, theme.colors]));
  assert.equal(colors['github-light'].gutterForeground, '#656d76');
  assert.equal(colors['solarized-light'].foreground, '#586e75');
  assert.equal(colors['solarized-light'].codeForeground, '#566c73');
  assert.equal(colors['solarized-light'].link, '#006da8');
  assert.equal(colors['solarized-light'].selectionForeground, '#3f555d');
  assert.equal(colors.sepia.link, '#765200');
  assert.equal(colors['github-dark'].gutterForeground, '#8b949e');
  assert.equal(colors['solarized-dark'].link, '#3aaed8');
  assert.equal(colors.dracula.blockquoteForeground, '#a8adc0');
  assert.equal(colors.monokai.blockquoteForeground, '#a8a590');
});

test('all text-bearing palette pairs meet WCAG AA contrast', () => {
  const pairs = [
    ['foreground', 'background'],
    ['link', 'background'],
    ['blockquoteForeground', 'background'],
    ['codeForeground', 'codeBackground'],
    ['gutterForeground', 'gutterBackground'],
    ['selectionForeground', 'selectionBackground'],
    ['selectionForeground', 'searchMatch'],
    ['selectionForeground', 'searchMatchSelected'],
  ];

  for (const theme of THEMES) {
    for (const [foreground, background] of pairs) {
      const ratio = contrastRatio(theme.colors[foreground], theme.colors[background]);
      assert.ok(
        ratio >= 4.5,
        `${theme.id} ${foreground}/${background} contrast ${ratio.toFixed(2)} is below 4.5`,
      );
    }
  }
});

test('category filtering keeps Sepia in the light palettes', () => {
  assert.deepEqual(
    themesForCategory('light').map(({ id }) => id),
    ['github-light', 'solarized-light', 'sepia'],
  );
  assert.deepEqual(
    themesForCategory('dark').map(({ id }) => id),
    ['github-dark', 'solarized-dark', 'dracula', 'monokai', 'nord'],
  );
});

test('resolver follows explicit and system appearance', () => {
  const selection = { lightThemeId: 'sepia', darkThemeId: 'nord' };
  assert.equal(resolveTheme({ ...selection, appearance: 'light', systemDark: true }).id, 'sepia');
  assert.equal(resolveTheme({ ...selection, appearance: 'dark', systemDark: false }).id, 'nord');
  assert.equal(resolveTheme({ ...selection, appearance: 'system', systemDark: false }).id, 'sepia');
  assert.equal(resolveTheme({ ...selection, appearance: 'system', systemDark: true }).id, 'nord');
});

test('invalid, obsolete, and cross-category IDs use GitHub fallbacks', () => {
  assert.equal(resolveTheme({ appearance: 'light', lightThemeId: 'missing' }).id, DEFAULT_LIGHT_THEME);
  assert.equal(resolveTheme({ appearance: 'dark', darkThemeId: 'sepia' }).id, DEFAULT_DARK_THEME);
  assert.equal(resolveTheme({ appearance: 'unknown', lightThemeId: 'sepia' }).id, 'sepia');
  assert.equal(
    cssVariablesForPalette({ id: 'untrusted', colors: { background: 'url(evil)' } })['--theme-background'],
    '#ffffff',
  );
});

test('CSS variable mapping is stable, complete, and used by tracked styles', async () => {
  const palette = THEMES[0];
  const variables = cssVariablesForPalette(palette);
  const expectedNames = THEME_TOKENS.map(
    (token) => `--theme-${token.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
  );
  assert.deepEqual(Object.keys(variables), expectedNames);
  assert.equal(variables['--theme-background'], '#ffffff');
  assert.equal(variables['--theme-search-match-selected'], '#b6d7ff');

  const styles = await Promise.all([
    'app.css',
    'editor-theme.css',
    'preview.css',
  ].map((name) => readFile(new URL(`../dist/styles/${name}`, import.meta.url), 'utf8')));
  const combinedStyles = styles.join('\n');
  for (const variable of expectedNames) {
    assert.match(combinedStyles, new RegExp(`var\\(${variable.replaceAll('-', '\\-')}\\)`));
  }
});

test('Windows integration keeps trusted syntax, dialog, and release safeguards', async () => {
  const [editorSource, editorStyles, appStyles, workflow] = await Promise.all([
    readFile(new URL('../src/js/editor.js', import.meta.url), 'utf8'),
    readFile(new URL('../dist/styles/editor-theme.css', import.meta.url), 'utf8'),
    readFile(new URL('../dist/styles/app.css', import.meta.url), 'utf8'),
    readFile(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8'),
  ]);

  assert.match(editorSource, /HighlightStyle\.define/);
  assert.match(editorSource, /backgroundColor: 'var\(--theme-code-background\)'/);
  assert.match(editorSource, /tag: tags\.list, color: 'var\(--theme-link\)'/);
  assert.doesNotMatch(editorStyles, /\.tok-/);

  assert.match(
    appStyles,
    /\.button-primary\s*\{[^}]*color: var\(--theme-selection-foreground\);[^}]*background: var\(--theme-selection-background\);/s,
  );
  assert.match(workflow, /RELEASE_TAG: \$\{\{ github\.ref_name \}\}/);
  assert.match(workflow, /\$env:RELEASE_TAG -cnotmatch '\^v\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+\$'/);
  assert.doesNotMatch(
    workflow.slice(workflow.indexOf('- name: Create release and attach installers')),
    /run: \|[\s\S]*\$\{\{ github\.ref_name \}\}/,
  );
});
