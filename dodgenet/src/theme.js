// Theme switching: "system" (follow the OS), "light" or "dark".
// The resolved theme is written to <html data-theme="..."> and App.css reacts to it.

const THEME_KEY = 'app-theme';

export const THEMES = ['system', 'light', 'dark'];

const prefersLight = window.matchMedia('(prefers-color-scheme: light)');

export function getTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (THEMES.includes(saved)) return saved;
  } catch {
    // localStorage may be unavailable (private mode etc.)
  }
  return 'system';
}

function resolve(theme) {
  if (theme === 'system') return prefersLight.matches ? 'light' : 'dark';
  return theme;
}

export function applyTheme(theme = getTheme()) {
  document.documentElement.dataset.theme = resolve(theme);
}

export function setTheme(theme) {
  if (!THEMES.includes(theme)) return;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // not critical: the choice just will not be remembered
  }
  applyTheme(theme);
}

// Applied once on import (before React renders), so there is no flash of the wrong theme.
applyTheme();

// In "system" mode, follow OS theme changes while the app is open.
prefersLight.addEventListener('change', () => {
  if (getTheme() === 'system') applyTheme();
});
