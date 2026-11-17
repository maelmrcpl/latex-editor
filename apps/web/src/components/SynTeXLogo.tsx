import React from 'react';

interface SynTeXLogoProps {
  /** 'full' shows mark + SynTeX wordmark (+ optional tagline), 'compact' for tight headers, 'icon' for app badge */
  variant?: 'full' | 'compact' | 'stacked' | 'icon';
  showTagline?: boolean;
  className?: string;
}

/**
 * Official SynTeX Brand Component (mark + two-tone wordmark + tagline)
 * Uses the transparent high-res SynTeX mark & app icon assets in /brand/.
 */
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
        className={`w-8 h-8 rounded-lg object-contain select-none ${className}`}
      />
    );
  }

  if (variant === 'stacked') {
    return (
      <div className={`flex flex-col items-center text-center select-none ${className}`}>
        <img
          src="/brand/syntex-mark.png"
          alt="SynTeX Logo"
          className="w-16 h-16 object-contain mb-2.5 drop-shadow-[0_4px_20px_rgba(82,54,255,0.35)]"
        />
        <div className="text-2xl font-extrabold tracking-tight leading-none">
          <span className="text-white">Syn</span>
          <span className="text-[#634BFF]">TeX</span>
        </div>
        {showTagline && (
          <p className="text-xs text-zinc-400 mt-1.5 font-medium tracking-wide">
            L&apos;éditeur LaTeX collaboratif
          </p>
        )}
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div className={`inline-flex items-center gap-2 select-none ${className}`}>
        <img
          src="/brand/syntex-mark.png"
          alt="SynTeX"
          className="w-6 h-6 object-contain shrink-0"
        />
        <span className="font-extrabold text-sm tracking-tight leading-none">
          <span className="text-white">Syn</span>
          <span className="text-[#634BFF]">TeX</span>
        </span>
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-3 select-none ${className}`}>
      <img
        src="/brand/syntex-mark.png"
        alt="SynTeX"
        className="w-9 h-9 object-contain shrink-0 drop-shadow-[0_2px_12px_rgba(82,54,255,0.3)]"
      />
      <div className="flex flex-col">
        <span className="text-lg font-extrabold tracking-tight leading-none">
          <span className="text-white">Syn</span>
          <span className="text-[#634BFF]">TeX</span>
        </span>
        {showTagline && (
          <span className="text-[11px] text-zinc-400 mt-0.5 leading-tight">
            L&apos;éditeur LaTeX collaboratif
          </span>
        )}
      </div>
    </div>
  );
};
