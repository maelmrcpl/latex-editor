import React, { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { Button, inputClass } from './index';

/* -------------------------------------------------------------------------- */
/* Modale                                                                     */
/* -------------------------------------------------------------------------- */

export const Modal: React.FC<{
  title: string;
  description?: React.ReactNode;
  onClose: () => void;
  size?: 'sm' | 'md';
  children: React.ReactNode;
}> = ({ title, description, onClose, size = 'sm', children }) => {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Focus initial : premier champ, sinon le panneau
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const target =
      panel.querySelector<HTMLElement>('[data-autofocus]') ??
      panel.querySelector<HTMLElement>('input, select, textarea') ??
      panel;
    target.focus();
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-scrim animate-scrim-enter"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`w-full ${size === 'md' ? 'max-w-lg' : 'max-w-md'} bg-surface border border-outline-variant rounded-2xl shadow-overlay p-6 animate-surface-enter focus:outline-none`}
      >
        <h2 id={titleId} className="font-display text-headline-md text-on-surface">
          {title}
        </h2>
        {description && (
          <div className="mt-1.5 text-body-md text-on-surface-variant">{description}</div>
        )}
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Confirmations et saisies (remplacent window.confirm / window.prompt)       */
/* -------------------------------------------------------------------------- */

interface ConfirmOptions {
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
}

interface PromptOptions {
  title: string;
  message?: React.ReactNode;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
}

type DialogRequest =
  | { kind: 'confirm'; options: ConfirmOptions; resolve: (ok: boolean) => void }
  | { kind: 'prompt'; options: PromptOptions; resolve: (value: string | null) => void };

interface DialogApi {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
}

const DialogContext = createContext<DialogApi | null>(null);

export function useDialogs(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialogs doit être utilisé dans <DialogProvider>.');
  return ctx;
}

export const DialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [request, setRequest] = useState<DialogRequest | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setRequest({ kind: 'confirm', options, resolve })),
    []
  );
  const prompt = useCallback(
    (options: PromptOptions) =>
      new Promise<string | null>((resolve) => setRequest({ kind: 'prompt', options, resolve })),
    []
  );

  const api = React.useMemo(() => ({ confirm, prompt }), [confirm, prompt]);

  return (
    <DialogContext.Provider value={api}>
      {children}
      {request?.kind === 'confirm' && (
        <ConfirmDialog
          options={request.options}
          onDone={(ok) => {
            request.resolve(ok);
            setRequest(null);
          }}
        />
      )}
      {request?.kind === 'prompt' && (
        <PromptDialog
          options={request.options}
          onDone={(value) => {
            request.resolve(value);
            setRequest(null);
          }}
        />
      )}
    </DialogContext.Provider>
  );
};

const ConfirmDialog: React.FC<{ options: ConfirmOptions; onDone: (ok: boolean) => void }> = ({
  options,
  onDone,
}) => (
  <Modal title={options.title} description={options.message} onClose={() => onDone(false)}>
    <div className="flex items-center justify-end gap-2">
      <Button variant="ghost" onClick={() => onDone(false)}>
        {options.cancelLabel ?? 'Annuler'}
      </Button>
      <Button
        data-autofocus
        variant={options.tone === 'danger' ? 'danger' : 'primary'}
        onClick={() => onDone(true)}
      >
        {options.confirmLabel ?? 'Confirmer'}
      </Button>
    </div>
  </Modal>
);

const PromptDialog: React.FC<{
  options: PromptOptions;
  onDone: (value: string | null) => void;
}> = ({ options, onDone }) => {
  const [value, setValue] = useState(options.defaultValue ?? '');
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // Sélectionne le nom sans l'extension pour un renommage rapide
    const input = inputRef.current;
    if (!input) return;
    const dot = input.value.lastIndexOf('.');
    const slash = input.value.lastIndexOf('/');
    input.setSelectionRange(slash + 1, dot > slash ? dot : input.value.length);
  }, []);

  return (
    <Modal title={options.title} description={options.message} onClose={() => onDone(null)}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onDone(value.trim() ? value.trim() : null);
        }}
        className="space-y-5"
      >
        <div className="space-y-1.5">
          <label htmlFor={inputId} className="block text-label-md text-on-surface-variant">
            {options.label}
          </label>
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={options.placeholder}
            className={`${inputClass} font-mono text-code-md`}
            spellCheck={false}
            autoComplete="off"
          />
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={() => onDone(null)}>
            Annuler
          </Button>
          <Button type="submit" variant="primary" disabled={!value.trim()}>
            {options.confirmLabel ?? 'Valider'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
