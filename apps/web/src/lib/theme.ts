import { useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'syntex-theme';
const listeners = new Set<(theme: Theme) => void>();

function readStoredTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

let currentTheme: Theme = readStoredTheme();

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'light') root.dataset.theme = 'light';
  else delete root.dataset.theme;
}

/** Applique le thème enregistré (sombre par défaut). À appeler avant le premier rendu. */
export function initTheme() {
  applyTheme(currentTheme);
}

export function setTheme(theme: Theme) {
  currentTheme = theme;
  applyTheme(theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Stockage indisponible : le thème vaut pour la session uniquement
  }
  listeners.forEach((fn) => fn(theme));
}

export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setLocal] = useState<Theme>(currentTheme);
  useEffect(() => {
    listeners.add(setLocal);
    return () => {
      listeners.delete(setLocal);
    };
  }, []);
  return [theme, setTheme];
}
