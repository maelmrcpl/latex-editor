import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import type { ProjectFileEntry } from '@prism-latex/shared';
import { cx, Kbd } from './ui';

const MAX_RESULTS = 50;

/**
 * Score de correspondance approximative (plus petit = meilleur), ou null si `query`
 * n'est pas une sous-séquence du chemin. Les correspondances dans le nom du fichier
 * et les caractères consécutifs sont favorisés.
 */
function matchScore(path: string, query: string): number | null {
  const p = path.toLowerCase();
  const q = query.toLowerCase();
  const base = p.slice(p.lastIndexOf('/') + 1);
  if (base.startsWith(q)) return 0;
  if (base.includes(q)) return 1;
  if (p.includes(q)) return 2;

  let score = 3;
  let pos = -1;
  for (const ch of q) {
    const next = p.indexOf(ch, pos + 1);
    if (next === -1) return null;
    score += next - pos - 1; // pénalise les trous
    pos = next;
  }
  return score;
}

/** Ouverture rapide d'un fichier au clavier (Ctrl+P). */
export const QuickOpen: React.FC<{
  files: ProjectFileEntry[];
  activePath: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}> = ({ files, activePath, onSelect, onClose }) => {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) {
      // Sans saisie : le fichier courant en dernier, les autres par ordre alphabétique
      return [...files]
        .sort((a, b) => Number(a.path === activePath) - Number(b.path === activePath) || a.path.localeCompare(b.path))
        .slice(0, MAX_RESULTS);
    }
    return files
      .map((f) => ({ f, score: matchScore(f.path, q) }))
      .filter((r): r is { f: ProjectFileEntry; score: number } => r.score !== null)
      .sort((a, b) => a.score - b.score || a.f.path.length - b.f.path.length)
      .slice(0, MAX_RESULTS)
      .map((r) => r.f);
  }, [files, query, activePath]);

  useEffect(() => setIndex(0), [query]);

  useEffect(() => {
    listRef.current?.children[index]?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = results[index];
      if (target) onSelect(target.path);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center items-start pt-[12vh] px-4 bg-scrim animate-scrim-enter"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Ouvrir un fichier"
        className="w-full max-w-lg bg-surface border border-outline-variant rounded-xl shadow-overlay overflow-hidden animate-surface-enter"
      >
        <label className="flex items-center gap-2 h-11 px-gutter-md border-b border-outline-variant">
          <Search className="w-4 h-4 text-on-surface-variant shrink-0" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Nom ou chemin du fichier..."
            aria-label="Nom ou chemin du fichier"
            role="combobox"
            aria-expanded="true"
            aria-controls="quick-open-list"
            aria-activedescendant={results[index] ? `quick-open-${index}` : undefined}
            spellCheck={false}
            autoComplete="off"
            className="flex-1 min-w-0 bg-transparent border-none p-0 font-mono text-code-md text-on-surface placeholder:font-sans placeholder:text-body-sm placeholder:text-outline focus:outline-none"
          />
          <Kbd>Échap</Kbd>
        </label>

        {results.length === 0 ? (
          <p className="px-gutter-md py-6 text-center text-body-sm text-on-surface-variant">
            Aucun fichier ne correspond.
          </p>
        ) : (
          <ul id="quick-open-list" ref={listRef} role="listbox" className="max-h-[50vh] overflow-y-auto p-gutter-xs">
            {results.map((f, i) => {
              const slash = f.path.lastIndexOf('/');
              const name = f.path.slice(slash + 1);
              const dir = slash === -1 ? '' : f.path.slice(0, slash);
              return (
                <li
                  key={f.path}
                  id={`quick-open-${i}`}
                  role="option"
                  aria-selected={i === index}
                  onMouseMove={() => setIndex(i)}
                  onClick={() => onSelect(f.path)}
                  className={cx(
                    'flex items-center gap-gutter-sm h-8 px-gutter-sm rounded-sm cursor-pointer select-none',
                    i === index ? 'bg-surface-container-high' : ''
                  )}
                >
                  <span className={cx('font-mono text-code-md truncate', i === index ? 'text-on-surface' : 'text-on-surface-variant')}>
                    {name}
                  </span>
                  {dir && <span className="font-mono text-code-sm text-outline truncate">{dir}</span>}
                  {f.path === activePath && (
                    <span className="ml-auto text-label-sm text-outline shrink-0">ouvert</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};
