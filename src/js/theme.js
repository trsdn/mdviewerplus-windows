// Theme management: System / Light / Dark
// Uses data-theme attribute on <body> and CodeMirror compartment

let currentTheme = 'system';
let onThemeChangeCallback = null;

export function initTheme(savedTheme, onThemeChange) {
  onThemeChangeCallback = onThemeChange;
  setTheme(savedTheme || 'system');

  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (currentTheme === 'system' && onThemeChangeCallback) {
      onThemeChangeCallback(isDark());
    }
  });
}

export function setTheme(theme) {
  currentTheme = theme;
  document.body.setAttribute('data-theme', theme);
  if (onThemeChangeCallback) {
    onThemeChangeCallback(isDark());
  }
}

export function getTheme() {
  return currentTheme;
}

export function isDark() {
  if (currentTheme === 'dark') return true;
  if (currentTheme === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function cycleTheme() {
  const modes = ['system', 'light', 'dark'];
  const idx = modes.indexOf(currentTheme);
  setTheme(modes[(idx + 1) % modes.length]);
  return currentTheme;
}
