import {
  APPEARANCE_MODES,
  DEFAULT_DARK_THEME,
  DEFAULT_LIGHT_THEME,
  cssVariablesForPalette,
  resolveTheme,
  validThemeId,
} from './theme-registry.js';

let appearance = 'system';
let lightThemeId = DEFAULT_LIGHT_THEME;
let darkThemeId = DEFAULT_DARK_THEME;
let resolvedPalette = null;
let onThemeChangeCallback = null;
let systemThemeQuery = null;

export function initTheme(settings = {}, onThemeChange) {
  const saved = typeof settings === 'string' ? { appearance: settings } : settings;
  appearance = APPEARANCE_MODES.includes(saved.appearance) ? saved.appearance : 'system';
  lightThemeId = validThemeId(saved.light_theme, 'light')
    ? saved.light_theme
    : DEFAULT_LIGHT_THEME;
  darkThemeId = validThemeId(saved.dark_theme, 'dark')
    ? saved.dark_theme
    : DEFAULT_DARK_THEME;
  onThemeChangeCallback = onThemeChange;

  systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
  systemThemeQuery.addEventListener('change', handleSystemThemeChange);
  applyTheme();
}

function handleSystemThemeChange() {
  if (appearance === 'system') {
    applyTheme();
  }
}

function applyTheme() {
  resolvedPalette = resolveTheme({
    appearance,
    lightThemeId,
    darkThemeId,
    systemDark: systemThemeQuery?.matches ?? false,
  });

  const root = document.documentElement;
  for (const [name, value] of Object.entries(cssVariablesForPalette(resolvedPalette))) {
    root.style.setProperty(name, value);
  }
  root.style.colorScheme = resolvedPalette.category;
  document.body.dataset.appearance = appearance;
  document.body.dataset.theme = resolvedPalette.category;
  document.body.dataset.themeId = resolvedPalette.id;

  onThemeChangeCallback?.(resolvedPalette, getThemeSettings());
  return resolvedPalette;
}

export function setAppearanceMode(mode) {
  appearance = APPEARANCE_MODES.includes(mode) ? mode : 'system';
  return applyTheme();
}

// Compatibility for the existing System/Light/Dark menu actions.
export function setTheme(mode) {
  return setAppearanceMode(mode);
}

export function setPreferredTheme(category, id) {
  if (category === 'light') {
    lightThemeId = validThemeId(id, 'light') ? id : DEFAULT_LIGHT_THEME;
  } else if (category === 'dark') {
    darkThemeId = validThemeId(id, 'dark') ? id : DEFAULT_DARK_THEME;
  }
  return applyTheme();
}

export function setThemeSettings(settings) {
  appearance = APPEARANCE_MODES.includes(settings.appearance)
    ? settings.appearance
    : 'system';
  lightThemeId = validThemeId(settings.light_theme, 'light')
    ? settings.light_theme
    : DEFAULT_LIGHT_THEME;
  darkThemeId = validThemeId(settings.dark_theme, 'dark')
    ? settings.dark_theme
    : DEFAULT_DARK_THEME;
  return applyTheme();
}

export function getTheme() {
  return appearance;
}

export function getThemeSettings() {
  return {
    appearance,
    light_theme: lightThemeId,
    dark_theme: darkThemeId,
  };
}

export function getResolvedPalette() {
  return resolvedPalette;
}

export function isDark() {
  return resolvedPalette?.category === 'dark';
}

export function cycleTheme() {
  const index = APPEARANCE_MODES.indexOf(appearance);
  setAppearanceMode(APPEARANCE_MODES[(index + 1) % APPEARANCE_MODES.length]);
  return appearance;
}
