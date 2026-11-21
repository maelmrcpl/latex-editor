import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { DiagnosticItem } from '@prism-latex/shared';
import { cx, Tabs } from './ui';

interface DiagnosticsDrawerProps {
  diagnostics: DiagnosticItem[];
  rawLog: string;
  open: boolean;
  onToggle: () => void;
  onJumpToLocation: (file: string, line: number) => void;
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

export const DiagnosticsDrawer: React.FC<DiagnosticsDrawerProps> = ({
  diagnostics,
  rawLog,
  open,
  onToggle,
  onJumpToLocation,
}) => {
  const [tab, setTab] = useState<'problems' | 'raw'>('problems');

  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const warnCount = diagnostics.filter((d) => d.severity === 'warning').length;

  return (
    <section aria-label="Diagnostics LaTeX" className="bg-surface border-t border-outline-variant shrink-0">
      {/* Barre toujours visible */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-gutter-md py-gutter-sm hover:bg-surface-container transition-colors duration-100 ease-out"
      >
        <span className="flex items-center gap-gutter-md">
          <span className="text-label-md text-on-surface-variant">Diagnostics LaTeX</span>
          <span
            className={cx(
              'text-label-sm tabular-nums',
              errorCount > 0 ? 'text-error' : 'text-on-surface-variant'
            )}
          >
            {plural(errorCount, 'erreur')}
          </span>
          <span
            className={cx(
              'text-label-sm tabular-nums',
              warnCount > 0 ? 'text-warning' : 'text-on-surface-variant'
            )}
          >
            {plural(warnCount, 'avertissement')}
          </span>
        </span>
        {open ? (
          <ChevronDown className="w-[18px] h-[18px] text-on-surface-variant" />
        ) : (
          <ChevronUp className="w-[18px] h-[18px] text-on-surface-variant" />
        )}
      </button>

      {/* Contenu repliable (220 ms à l'ouverture, 150 ms à la fermeture) */}
      <div
        className={cx(
          'grid transition-[grid-template-rows]',
          open ? 'grid-rows-[1fr] duration-[220ms] ease-enter' : 'grid-rows-[0fr] duration-150 ease-exit'
        )}
        aria-hidden={!open}
        inert={!open}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-outline-variant">
            <Tabs
              ariaLabel="Onglets diagnostics"
              className="px-gutter-md border-b border-outline-variant"
              value={tab}
              onChange={setTab}
              items={[
                { id: 'problems', label: `Problèmes (${diagnostics.length})` },
                { id: 'raw', label: 'Log complet' },
              ]}
            />

            <div className="h-48 overflow-y-auto">
              {tab === 'problems' ? (
                diagnostics.length === 0 ? (
                  <p className="p-gutter-md text-body-sm text-on-surface-variant text-center">
                    Aucune erreur ni avertissement détecté lors de la dernière compilation.
                  </p>
                ) : (
                  <ul className="p-gutter-sm flex flex-col gap-px">
                    {diagnostics.map((d, idx) => (
                      <li key={idx}>
                        <button
                          type="button"
                          onClick={() => {
                            if (d.line) onJumpToLocation(d.file, d.line);
                          }}
                          title={d.message}
                          className="w-full flex items-center justify-between gap-gutter-sm px-gutter-sm py-gutter-xs rounded-sm text-left hover:bg-surface-container transition-colors duration-100"
                        >
                          <span className="flex items-center gap-gutter-sm min-w-0">
                            <span
                              className={cx(
                                'w-1.5 h-1.5 rounded-full shrink-0',
                                d.severity === 'error' ? 'bg-error' : d.severity === 'warning' ? 'bg-warning' : 'bg-outline'
                              )}
                              aria-label={d.severity === 'error' ? 'Erreur' : 'Avertissement'}
                            />
                            <span className="text-body-sm text-on-surface truncate">{d.message}</span>
                          </span>
                          <span className="font-mono text-code-sm text-primary-text shrink-0 tabular-nums">
                            {d.file}
                            {d.line ? `:${d.line}` : ''}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              ) : (
                <pre className="min-h-full p-gutter-sm bg-surface-container-lowest font-mono text-code-sm font-normal text-on-surface-variant whitespace-pre-wrap break-words">
                  {rawLog || 'Aucun log disponible.'}
                </pre>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
