import React, { useState } from 'react';
import { AlertCircle, AlertTriangle, ChevronDown, ChevronUp, Terminal } from 'lucide-react';
import type { DiagnosticItem } from '@prism-latex/shared';

interface DiagnosticsDrawerProps {
  diagnostics: DiagnosticItem[];
  rawLog: string;
  open: boolean;
  onToggle: () => void;
  onJumpToLocation: (file: string, line: number) => void;
}

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
    <div className="border-t border-zinc-800 bg-zinc-950 flex flex-col shrink-0">
      {/* Header bar */}
      <div
        onClick={onToggle}
        className="h-9 px-3 flex items-center justify-between bg-zinc-900/80 hover:bg-zinc-900 cursor-pointer select-none text-xs"
      >
        <div className="flex items-center gap-3">
          <span className="font-medium text-zinc-300 flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5 text-zinc-400" />
            Diagnostics LaTeX
          </span>

          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] ${
              errorCount > 0 ? 'bg-red-500/20 text-red-300' : 'bg-zinc-800 text-zinc-400'
            }`}
          >
            <AlertCircle className="w-3 h-3" />
            {errorCount}
          </span>

          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] ${
              warnCount > 0 ? 'bg-amber-500/20 text-amber-300' : 'bg-zinc-800 text-zinc-400'
            }`}
          >
            <AlertTriangle className="w-3 h-3" />
            {warnCount}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {open && (
            <div className="flex items-center gap-1 mr-2" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setTab('problems')}
                className={`px-2 py-0.5 rounded text-[11px] cursor-pointer ${
                  tab === 'problems'
                    ? 'bg-indigo-600 text-white'
                    : 'text-zinc-400 hover:bg-zinc-800'
                }`}
              >
                Problèmes ({diagnostics.length})
              </button>
              <button
                onClick={() => setTab('raw')}
                className={`px-2 py-0.5 rounded text-[11px] cursor-pointer ${
                  tab === 'raw' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:bg-zinc-800'
                }`}
              >
                Log complet
              </button>
            </div>
          )}
          {open ? (
            <ChevronDown className="w-4 h-4 text-zinc-400" />
          ) : (
            <ChevronUp className="w-4 h-4 text-zinc-400" />
          )}
        </div>
      </div>

      {open && (
        <div className="h-48 overflow-y-auto bg-zinc-950 text-xs">
          {tab === 'problems' ? (
            diagnostics.length === 0 ? (
              <div className="p-4 text-zinc-500 text-center">
                Aucune erreur ni avertissement détecté lors de la dernière compilation.
              </div>
            ) : (
              <ul className="divide-y divide-zinc-900">
                {diagnostics.map((d, idx) => (
                  <li
                    key={idx}
                    onClick={() => {
                      if (d.line) onJumpToLocation(d.file, d.line);
                    }}
                    className="px-3 py-2 hover:bg-zinc-900/70 flex items-start gap-2.5 cursor-pointer"
                  >
                    {d.severity === 'error' ? (
                      <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-zinc-200 break-words">{d.message}</p>
                      <span className="text-[11px] font-mono text-zinc-500">
                        {d.file}
                        {d.line ? `:${d.line}` : ''}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <pre className="p-3 font-mono text-[11px] text-zinc-400 whitespace-pre-wrap break-words">
              {rawLog || 'Aucun log disponible.'}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};
