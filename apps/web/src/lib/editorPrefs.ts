import { useEffect, useState } from 'react';

/** Préférences d'affichage de l'éditeur, mémorisées dans le navigateur. */
export interface EditorPrefs {
  /** Taille du texte de l'éditeur (px) */
  fontSize: number;
  /** Retour à la ligne automatique des lignes longues */
  lineWrapping: boolean;
}

export const EDITOR_FONT_SIZES = { min: 11, max: 20, default: 13 } as const;

const STORAGE_KEY = 'syntex-editor-prefs';
const DEFAULT_PREFS: EditorPrefs = { fontSize: EDITOR_FONT_SIZES.default, lineWrapping: true };
const listeners = new Set<(prefs: EditorPrefs) => void>();

function readStoredPrefs(): EditorPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<EditorPrefs>;
    const fontSize =
      typeof raw.fontSize === 'number'
        ? Math.min(EDITOR_FONT_SIZES.max, Math.max(EDITOR_FONT_SIZES.min, Math.round(raw.fontSize)))
        : DEFAULT_PREFS.fontSize;
    const lineWrapping = typeof raw.lineWrapping === 'boolean' ? raw.lineWrapping : DEFAULT_PREFS.lineWrapping;
    return { fontSize, lineWrapping };
  } catch {
    return DEFAULT_PREFS;
  }
}

let currentPrefs = readStoredPrefs();

function applyPrefs(prefs: EditorPrefs) {
  document.documentElement.style.setProperty('--sx-editor-font-size', `${prefs.fontSize}px`);
}

export function initEditorPrefs() {
  applyPrefs(currentPrefs);
}

export function setEditorPrefs(patch: Partial<EditorPrefs>) {
  currentPrefs = { ...currentPrefs, ...patch };
  applyPrefs(currentPrefs);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentPrefs));
  } catch {
    // Stockage indisponible : préférences valables pour la session uniquement
  }
  listeners.forEach((fn) => fn(currentPrefs));
}

export function useEditorPrefs(): [EditorPrefs, (patch: Partial<EditorPrefs>) => void] {
  const [prefs, setLocal] = useState<EditorPrefs>(currentPrefs);
  useEffect(() => {
    listeners.add(setLocal);
    return () => {
      listeners.delete(setLocal);
    };
  }, []);
  return [prefs, setEditorPrefs];
}
