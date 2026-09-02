const STORAGE_KEY = 'approvals-theme';

function applyTheme(theme) {
  if (theme) {
    document.documentElement.setAttribute('data-theme', theme);
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

// Reads any stored preference and applies it immediately; returns the
// effective theme ('light' | 'dark') for UI that needs to reflect it.
export function initTheme() {
  const stored = localStorage.getItem(STORAGE_KEY);
  applyTheme(stored);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function setTheme(theme) {
  localStorage.setItem(STORAGE_KEY, theme);
  applyTheme(theme);
}
