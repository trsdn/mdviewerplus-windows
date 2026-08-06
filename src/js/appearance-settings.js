import { APPEARANCE_MODES, themeForId, themesForCategory } from './theme-registry.js';

let dialog;
let appearanceSelect;
let lightSelect;
let darkSelect;
let lightSwatch;
let darkSwatch;
let onSaveCallback;

function addThemeOptions(select, category) {
  for (const theme of themesForCategory(category)) {
    const option = document.createElement('option');
    option.value = theme.id;
    option.textContent = theme.name;
    select.append(option);
  }
}

function updateSwatch(element, themeId) {
  const theme = themeForId(themeId);
  element.replaceChildren();
  if (!theme) return;
  for (const token of ['background', 'foreground', 'link', 'codeBackground']) {
    const color = document.createElement('span');
    color.className = 'theme-swatch__color';
    color.style.backgroundColor = theme.colors[token];
    element.append(color);
  }
  element.setAttribute('aria-label', `${theme.name} color preview`);
}

export function initAppearanceSettings(onSave) {
  dialog = document.getElementById('appearance-settings');
  appearanceSelect = document.getElementById('appearance-mode');
  lightSelect = document.getElementById('light-theme');
  darkSelect = document.getElementById('dark-theme');
  lightSwatch = document.getElementById('light-theme-swatch');
  darkSwatch = document.getElementById('dark-theme-swatch');
  onSaveCallback = onSave;

  for (const mode of APPEARANCE_MODES) {
    const option = document.createElement('option');
    option.value = mode;
    option.textContent = mode[0].toUpperCase() + mode.slice(1);
    appearanceSelect.append(option);
  }
  addThemeOptions(lightSelect, 'light');
  addThemeOptions(darkSelect, 'dark');

  lightSelect.addEventListener('change', () => updateSwatch(lightSwatch, lightSelect.value));
  darkSelect.addEventListener('change', () => updateSwatch(darkSwatch, darkSelect.value));
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close('cancel');
  });
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    dialog.close('cancel');
  });
  dialog.querySelector('form').addEventListener('submit', (event) => {
    event.preventDefault();
    onSaveCallback?.({
      appearance: appearanceSelect.value,
      light_theme: lightSelect.value,
      dark_theme: darkSelect.value,
    });
    dialog.close('save');
  });
  document.getElementById('appearance-cancel').addEventListener('click', () => dialog.close('cancel'));
}

export function openAppearanceSettings(settings) {
  appearanceSelect.value = settings.appearance;
  lightSelect.value = settings.light_theme;
  darkSelect.value = settings.dark_theme;
  updateSwatch(lightSwatch, lightSelect.value);
  updateSwatch(darkSwatch, darkSelect.value);
  dialog.showModal();
  appearanceSelect.focus();
}
