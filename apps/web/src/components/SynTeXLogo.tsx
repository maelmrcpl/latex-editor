import React from 'react';
import { cx } from './ui';

interface SynTeXLogoProps {
  /** 'full' : symbole + nom (+ slogan) ; 'compact' : en-têtes serrés ; 'stacked' : écrans d'accueil ; 'icon' : badge d'application */
  variant?: 'full' | 'compact' | 'stacked' | 'icon';
  showTagline?: boolean;
  className?: string;
}

const TAGLINE = "L'éditeur LaTeX collaboratif";

const Wordmark: React.FC<{ className: string }> = ({ className }) => (
  <span className={cx('font-display font-semibold tracking-tight leading-none', className)}>
    <span className="text-on-surface">Syn</span>
    <span className="text-primary-text">TeX</span>
  </span>
);

/** Logo SynTeX : symbole + mot-symbole bicolore + slogan optionnel. */
export const SynTeXLogo: React.FC<SynTeXLogoProps> = ({
  variant = 'full',
  showTagline = false,
  className = '',
}) => {
  if (variant === 'icon') {
    return (
      <img
        src="/brand/syntex-icon.png"
        alt="SynTeX"
        className={cx('w-8 h-8 rounded-lg object-contain select-none', className)}
      />
    );
  }

  if (variant === 'stacked') {
    return (
      <div className={cx('flex flex-col items-center text-center select-none', className)}>
        <img src="/brand/syntex-mark.png" alt="" className="w-14 h-14 object-contain mb-3" />
        <Wordmark className="text-headline-lg" />
        {showTagline && <p className="text-body-sm text-on-surface-variant mt-1.5">{TAGLINE}</p>}
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div className={cx('inline-flex items-center gap-2 select-none', className)} aria-label="SynTeX">
        <img src="/brand/syntex-mark.png" alt="" className="w-5 h-5 object-contain shrink-0" />
        <Wordmark className="text-title-lg" />
      </div>
    );
  }

  return (
    <div className={cx('inline-flex items-center gap-2.5 select-none', className)} aria-label="SynTeX">
      <img src="/brand/syntex-mark.png" alt="" className="w-8 h-8 object-contain shrink-0" />
      <div className="flex flex-col">
        <Wordmark className="text-headline-md" />
        {showTagline && (
          <span className="text-label-sm text-on-surface-variant mt-0.5">{TAGLINE}</span>
        )}
      </div>
    </div>
  );
};
