export const APPEARANCE_MODES = Object.freeze(['system', 'light', 'dark']);
export const DEFAULT_LIGHT_THEME = 'github-light';
export const DEFAULT_DARK_THEME = 'github-dark';

export const THEME_TOKENS = Object.freeze([
  'background',
  'foreground',
  'border',
  'codeBackground',
  'codeForeground',
  'link',
  'blockquoteForeground',
  'blockquoteBorder',
  'horizontalRule',
  'selectionBackground',
  'selectionForeground',
  'caret',
  'activeLine',
  'gutterBackground',
  'gutterForeground',
  'splitter',
  'splitterHover',
  'searchMatch',
  'searchMatchSelected',
]);

const defineTheme = (id, name, category, colors) => Object.freeze({
  id,
  name,
  category,
  colors: Object.freeze(colors),
});

export const THEMES = Object.freeze([
  defineTheme('github-light', 'GitHub Light', 'light', {
    background: '#ffffff',
    foreground: '#24292f',
    border: '#d0d7de',
    codeBackground: '#f6f8fa',
    codeForeground: '#24292f',
    link: '#0969da',
    blockquoteForeground: '#656d76',
    blockquoteBorder: '#d0d7de',
    horizontalRule: '#d8dee4',
    selectionBackground: '#b6d7ff',
    selectionForeground: '#24292f',
    caret: '#24292f',
    activeLine: '#f6f8fa',
    gutterBackground: '#ffffff',
    gutterForeground: '#656d76',
    splitter: '#d0d7de',
    splitterHover: '#0969da',
    searchMatch: '#fff8c5',
    searchMatchSelected: '#b6d7ff',
  }),
  defineTheme('solarized-light', 'Solarized Light', 'light', {
    background: '#fdf6e3',
    foreground: '#586e75',
    border: '#93a1a1',
    codeBackground: '#eee8d5',
    codeForeground: '#566c73',
    link: '#006da8',
    blockquoteForeground: '#586e75',
    blockquoteBorder: '#93a1a1',
    horizontalRule: '#93a1a1',
    selectionBackground: '#d9e2cc',
    selectionForeground: '#3f555d',
    caret: '#586e75',
    activeLine: '#eee8d5',
    gutterBackground: '#fdf6e3',
    gutterForeground: '#586e75',
    splitter: '#93a1a1',
    splitterHover: '#006da8',
    searchMatch: '#e8d7a4',
    searchMatchSelected: '#b8d7e8',
  }),
  defineTheme('sepia', 'Sepia', 'light', {
    background: '#f4ecd8',
    foreground: '#3e3629',
    border: '#d4c4a8',
    codeBackground: '#e8dcc0',
    codeForeground: '#3e3629',
    link: '#765200',
    blockquoteForeground: '#6b5d4f',
    blockquoteBorder: '#d4c4a8',
    horizontalRule: '#cbbfa3',
    selectionBackground: '#d9c59e',
    selectionForeground: '#2f281e',
    caret: '#3e3629',
    activeLine: '#eee3c9',
    gutterBackground: '#f4ecd8',
    gutterForeground: '#6b5d4f',
    splitter: '#d4c4a8',
    splitterHover: '#765200',
    searchMatch: '#ead38f',
    searchMatchSelected: '#d9c59e',
  }),
  defineTheme('github-dark', 'GitHub Dark', 'dark', {
    background: '#0d1117',
    foreground: '#e6edf3',
    border: '#30363d',
    codeBackground: '#161b22',
    codeForeground: '#e6edf3',
    link: '#58a6ff',
    blockquoteForeground: '#8b949e',
    blockquoteBorder: '#30363d',
    horizontalRule: '#21262d',
    selectionBackground: '#264f78',
    selectionForeground: '#ffffff',
    caret: '#e6edf3',
    activeLine: '#161b22',
    gutterBackground: '#0d1117',
    gutterForeground: '#8b949e',
    splitter: '#30363d',
    splitterHover: '#58a6ff',
    searchMatch: '#4d3e00',
    searchMatchSelected: '#264f78',
  }),
  defineTheme('solarized-dark', 'Solarized Dark', 'dark', {
    background: '#002b36',
    foreground: '#839496',
    border: '#073642',
    codeBackground: '#073642',
    codeForeground: '#93a1a1',
    link: '#3aaed8',
    blockquoteForeground: '#839496',
    blockquoteBorder: '#073642',
    horizontalRule: '#073642',
    selectionBackground: '#075b70',
    selectionForeground: '#eee8d5',
    caret: '#93a1a1',
    activeLine: '#073642',
    gutterBackground: '#002b36',
    gutterForeground: '#839496',
    splitter: '#073642',
    splitterHover: '#3aaed8',
    searchMatch: '#5b4b00',
    searchMatchSelected: '#075b70',
  }),
  defineTheme('dracula', 'Dracula', 'dark', {
    background: '#282a36',
    foreground: '#f8f8f2',
    border: '#44475a',
    codeBackground: '#44475a',
    codeForeground: '#f8f8f2',
    link: '#bd93f9',
    blockquoteForeground: '#a8adc0',
    blockquoteBorder: '#44475a',
    horizontalRule: '#44475a',
    selectionBackground: '#44475a',
    selectionForeground: '#f8f8f2',
    caret: '#f8f8f2',
    activeLine: '#343746',
    gutterBackground: '#282a36',
    gutterForeground: '#a8adc0',
    splitter: '#44475a',
    splitterHover: '#ff79c6',
    searchMatch: '#6d5a00',
    searchMatchSelected: '#44475a',
  }),
  defineTheme('monokai', 'Monokai', 'dark', {
    background: '#272822',
    foreground: '#f8f8f2',
    border: '#49483e',
    codeBackground: '#3e3d32',
    codeForeground: '#f8f8f2',
    link: '#66d9ef',
    blockquoteForeground: '#a8a590',
    blockquoteBorder: '#49483e',
    horizontalRule: '#49483e',
    selectionBackground: '#49483e',
    selectionForeground: '#f8f8f2',
    caret: '#f8f8f2',
    activeLine: '#3e3d32',
    gutterBackground: '#272822',
    gutterForeground: '#a8a590',
    splitter: '#49483e',
    splitterHover: '#a6e22e',
    searchMatch: '#756e00',
    searchMatchSelected: '#49483e',
  }),
  defineTheme('nord', 'Nord', 'dark', {
    background: '#2e3440',
    foreground: '#eceff4',
    border: '#4c566a',
    codeBackground: '#3b4252',
    codeForeground: '#e5e9f0',
    link: '#88c0d0',
    blockquoteForeground: '#d8dee9',
    blockquoteBorder: '#4c566a',
    horizontalRule: '#4c566a',
    selectionBackground: '#434c5e',
    selectionForeground: '#eceff4',
    caret: '#eceff4',
    activeLine: '#3b4252',
    gutterBackground: '#2e3440',
    gutterForeground: '#81a1c1',
    splitter: '#4c566a',
    splitterHover: '#88c0d0',
    searchMatch: '#5e5a2f',
    searchMatchSelected: '#434c5e',
  }),
]);

const themesById = new Map(THEMES.map((theme) => [theme.id, theme]));

export function themesForCategory(category) {
  return THEMES.filter((theme) => theme.category === category);
}

export function themeForId(id) {
  return themesById.get(id);
}

export function validThemeId(id, category) {
  return themeForId(id)?.category === category;
}

export function resolveTheme({
  appearance = 'system',
  lightThemeId = DEFAULT_LIGHT_THEME,
  darkThemeId = DEFAULT_DARK_THEME,
  systemDark = false,
} = {}) {
  const mode = APPEARANCE_MODES.includes(appearance) ? appearance : 'system';
  const category = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;
  const requestedId = category === 'dark' ? darkThemeId : lightThemeId;
  const fallbackId = category === 'dark' ? DEFAULT_DARK_THEME : DEFAULT_LIGHT_THEME;
  return validThemeId(requestedId, category) ? themeForId(requestedId) : themeForId(fallbackId);
}

const cssVariableName = (token) => `--theme-${token.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;

export function cssVariablesForPalette(palette) {
  const trustedPalette = themeForId(palette?.id) || themeForId(
    palette?.category === 'dark' ? DEFAULT_DARK_THEME : DEFAULT_LIGHT_THEME,
  );
  return Object.freeze(Object.fromEntries(
    THEME_TOKENS.map((token) => [cssVariableName(token), trustedPalette.colors[token]]),
  ));
}
