import React from 'react';
import { Loader2, Moon, Sun } from 'lucide-react';
import { useTheme } from '../../lib/theme';

/** Concatène des classes en ignorant les valeurs vides. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

const STATE_TRANSITION = 'transition-colors duration-100 ease-out';

/* -------------------------------------------------------------------------- */
/* Boutons                                                                    */
/* -------------------------------------------------------------------------- */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover',
  secondary:
    'border border-outline-variant bg-surface-container-low text-on-surface hover:bg-surface-container',
  ghost: 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
  danger: 'bg-error text-on-error hover:opacity-90',
  success: 'bg-success text-on-success hover:opacity-90',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 gap-1.5 rounded-sm text-label-md',
  md: 'h-8 px-3 gap-1.5 rounded-lg text-label-lg',
  lg: 'h-10 px-4 gap-2 rounded-lg text-label-lg',
};

type ButtonOwnProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  loading?: boolean;
};

type ButtonProps = ButtonOwnProps &
  (
    | ({ href?: undefined } & React.ButtonHTMLAttributes<HTMLButtonElement>)
    | ({ href: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>)
  );

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  icon,
  loading = false,
  className,
  children,
  ...rest
}) => {
  const classes = cx(
    'inline-flex items-center justify-center whitespace-nowrap select-none',
    'disabled:opacity-50 disabled:pointer-events-none aria-disabled:opacity-50 aria-disabled:pointer-events-none',
    STATE_TRANSITION,
    BUTTON_VARIANTS[variant],
    BUTTON_SIZES[size],
    className
  );
  const content = (
    <>
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : icon}
      {children}
    </>
  );
  if (rest.href !== undefined) {
    return (
      <a className={classes} {...(rest as React.AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {content}
      </a>
    );
  }
  const buttonProps = rest as React.ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button type="button" className={classes} {...buttonProps}>
      {content}
    </button>
  );
};

type IconButtonProps = {
  label: string;
  tone?: 'default' | 'danger';
  variant?: 'ghost' | 'outlined';
  size?: 'sm' | 'md';
  active?: boolean;
  children: React.ReactNode;
} & (
  | ({ href?: undefined } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'>)
  | ({ href: string } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'children'>)
);

/** Bouton icône : `label` sert d'info-bulle et de nom accessible. */
export const IconButton: React.FC<IconButtonProps> = ({
  label,
  tone = 'default',
  variant = 'ghost',
  size = 'md',
  active = false,
  className,
  children,
  ...rest
}) => {
  const classes = cx(
    'inline-flex items-center justify-center shrink-0 select-none',
    'disabled:opacity-40 disabled:pointer-events-none',
    STATE_TRANSITION,
    size === 'sm' ? 'w-6 h-6 rounded-sm' : 'w-8 h-8 rounded-lg',
    variant === 'outlined' && 'border border-outline-variant bg-surface-container-low',
    active
      ? 'bg-surface-container-high text-on-surface'
      : 'text-on-surface-variant hover:text-on-surface',
    tone === 'danger'
      ? 'hover:bg-error-container hover:text-on-error-container'
      : 'hover:bg-surface-container',
    className
  );
  if (rest.href !== undefined) {
    return (
      <a
        title={label}
        aria-label={label}
        className={classes}
        {...(rest as React.AnchorHTMLAttributes<HTMLAnchorElement>)}
      >
        {children}
      </a>
    );
  }
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={classes}
      {...(rest as React.ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      {children}
    </button>
  );
};

/* -------------------------------------------------------------------------- */
/* Badges                                                                     */
/* -------------------------------------------------------------------------- */

export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'error';

const BADGE_TONES: Record<Tone, string> = {
  neutral: 'bg-surface-container-high text-on-surface-variant',
  primary: 'bg-primary-container text-on-primary-container',
  success: 'bg-success-container text-on-success-container',
  warning: 'bg-warning-container text-on-warning-container',
  error: 'bg-error-container text-on-error-container',
};

const DOT_TONES: Record<Tone, string> = {
  neutral: 'bg-outline',
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-error',
};

export const Badge: React.FC<{
  tone?: Tone;
  mono?: boolean;
  icon?: React.ReactNode;
  className?: string;
  title?: string;
  children: React.ReactNode;
}> = ({ tone = 'neutral', mono = false, icon, className, title, children }) => (
  <span
    title={title}
    className={cx(
      'inline-flex items-center gap-1 h-5 px-1.5 rounded-sm shrink-0 tabular-nums whitespace-nowrap',
      mono ? 'font-mono text-code-sm' : 'text-label-sm',
      BADGE_TONES[tone],
      className
    )}
  >
    {icon}
    {children}
  </span>
);

/** Pastille de statut : point coloré + libellé. */
export const StatusDot: React.FC<{
  tone?: Tone;
  className?: string;
  title?: string;
  children: React.ReactNode;
}> = ({ tone = 'neutral', className, title, children }) => (
  <span
    title={title}
    className={cx('inline-flex items-center gap-1.5 text-label-md text-on-surface-variant', className)}
  >
    <span className={cx('w-1.5 h-1.5 rounded-full shrink-0', DOT_TONES[tone])} aria-hidden />
    {children}
  </span>
);

/* -------------------------------------------------------------------------- */
/* Onglets                                                                    */
/* -------------------------------------------------------------------------- */

export interface TabItem<T extends string> {
  id: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className,
  ariaLabel,
}: {
  items: Array<TabItem<T>>;
  value: T;
  onChange: (id: T) => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={cx('flex items-stretch gap-gutter-md', className)}>
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(item.id)}
            className={cx(
              'inline-flex items-center gap-1.5 py-gutter-xs border-b-2 -mb-px text-label-md select-none',
              STATE_TRANSITION,
              selected
                ? 'border-primary text-primary-text'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            )}
          >
            {item.icon}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Formulaires                                                                */
/* -------------------------------------------------------------------------- */

export const inputClass = cx(
  'w-full h-9 px-3 rounded-lg border border-outline-variant bg-surface-container-lowest',
  'text-body-md text-on-surface placeholder:text-outline',
  'focus:outline-none focus:border-primary',
  STATE_TRANSITION
);

export const Field: React.FC<{
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}> = ({ label, htmlFor, hint, children }) => (
  <div className="space-y-1.5">
    <label htmlFor={htmlFor} className="block text-label-md text-on-surface-variant">
      {label}
    </label>
    {children}
    {hint && <p className="text-body-sm text-outline">{hint}</p>}
  </div>
);

/* -------------------------------------------------------------------------- */
/* Retours d'état                                                             */
/* -------------------------------------------------------------------------- */

export const Alert: React.FC<{
  tone?: 'error' | 'warning';
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}> = ({ tone = 'error', icon, className, children }) => (
  <div
    role="alert"
    className={cx(
      'flex items-start gap-2 px-3 py-2.5 rounded-lg text-body-sm',
      tone === 'error'
        ? 'bg-error-container text-on-error-container'
        : 'bg-warning-container text-on-warning-container',
      className
    )}
  >
    {icon}
    <div className="min-w-0 flex-1">{children}</div>
  </div>
);

export const Spinner: React.FC<{ className?: string }> = ({ className }) => (
  <Loader2 className={cx('w-4 h-4 animate-spin text-primary-text', className)} aria-hidden />
);

/** Écran de chargement plein cadre. */
export const LoadingScreen: React.FC<{ label: string }> = ({ label }) => (
  <div className="h-screen bg-background text-on-surface-variant flex items-center justify-center gap-2 text-body-md">
    <Spinner />
    {label}
  </div>
);

/** Jauge de remplissage (stockage). */
export const Meter: React.FC<{
  ratio: number;
  minVisible?: number;
  className?: string;
  label?: string;
}> = ({ ratio, minVisible = 0, className, label }) => {
  const tone = ratio >= 0.95 ? 'bg-error' : ratio >= 0.8 ? 'bg-warning' : 'bg-primary';
  return (
    <div
      className={cx('h-1.5 rounded-full bg-surface-container-high overflow-hidden', className)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(ratio * 100)}
    >
      <div
        className={cx('h-full rounded-full transition-[width] duration-200 ease-out', tone)}
        style={{ width: `${Math.max(ratio * 100, minVisible)}%` }}
      />
    </div>
  );
};

/** Avatar Google, ou initiales sur pastille neutre. */
export const Avatar: React.FC<{ src?: string | null; name?: string; size?: 'sm' | 'md' }> = ({
  src,
  name,
  size = 'sm',
}) => {
  const dim = size === 'sm' ? 'w-6 h-6 text-[10px]' : 'w-7 h-7 text-label-sm';
  if (src) {
    return <img src={src} alt="" referrerPolicy="no-referrer" className={cx(dim, 'rounded-full shrink-0')} />;
  }
  const initials = (name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  return (
    <span
      className={cx(
        dim,
        'rounded-full shrink-0 bg-surface-container border border-outline-variant text-on-surface font-medium flex items-center justify-center'
      )}
      aria-hidden
    >
      {initials}
    </span>
  );
};

export const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="inline-flex items-center shrink-0 whitespace-nowrap h-5 px-1.5 rounded-sm border border-outline-variant bg-surface-container text-code-sm text-on-surface-variant">
    {children}
  </kbd>
);

export const ThemeToggle: React.FC<{ size?: 'sm' | 'md' }> = ({ size = 'md' }) => {
  const [theme, setTheme] = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <IconButton
      size={size}
      label={theme === 'dark' ? 'Passer au thème clair' : 'Passer au thème sombre'}
      onClick={() => setTheme(next)}
    >
      {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </IconButton>
  );
};
