import React from 'react';
import { SynTeXLogo } from './SynTeXLogo';
import { ThemeToggle } from './ui';

/** Mise en page des écrans d'authentification : carte unique centrée. */
export const AuthCard: React.FC<{ children: React.ReactNode; footer?: React.ReactNode }> = ({
  children,
  footer,
}) => (
  <div className="min-h-screen bg-background text-on-background flex flex-col items-center justify-center p-4">
    <div className="fixed top-3 right-3">
      <ThemeToggle />
    </div>
    <main className="w-full max-w-sm bg-surface border border-outline-variant rounded-xl animate-surface-enter">
      <div className="px-8 pt-8 pb-6">
        <SynTeXLogo variant="stacked" showTagline className="mb-8" />
        {children}
      </div>
      {footer && (
        <div className="px-8 py-4 border-t border-outline-variant flex items-center justify-between gap-2">
          {footer}
        </div>
      )}
    </main>
  </div>
);
