import React, { useEffect, useState } from 'react';
import { FolderOpen, LogOut, Plus, Users } from 'lucide-react';
import type { AuthUser, StorageUsage } from '@prism-latex/shared';
import { api } from '../lib/api';
import { formatBytes, quotaRatio } from '../lib/format';
import { Avatar, Button, cx, IconButton, Meter, ThemeToggle } from './ui';

export type ShellSection = 'projects' | 'users';

interface AppShellProps {
  user: AuthUser;
  section: ShellSection;
  /** Nombre de projets affiché dans la navigation (si connu) */
  projectCount?: number;
  /** Incrémenter pour recharger la jauge de stockage (après une suppression, par ex.) */
  storageVersion?: number;
  onNewProject: () => void;
  onNavigate: (section: ShellSection) => void;
  onLogout: () => void;
  children: React.ReactNode;
}

/** Cadre des pages tableau de bord et administration : rail latéral + contenu. */
export const AppShell: React.FC<AppShellProps> = ({
  user,
  section,
  projectCount,
  storageVersion = 0,
  onNewProject,
  onNavigate,
  onLogout,
  children,
}) => {
  const isAdmin = user.role === 'admin';
  const [storage, setStorage] = useState<StorageUsage | null>(null);

  useEffect(() => {
    api.account
      .storage()
      .then(setStorage)
      .catch(() => setStorage(null));
  }, [storageVersion]);

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-[240px_1fr] bg-background text-on-background">
      <aside className="flex flex-col justify-between gap-gutter-lg bg-surface border-b lg:border-b-0 lg:border-r border-outline-variant p-gutter-md lg:sticky lg:top-0 lg:h-screen">
        <div className="flex flex-col gap-gutter-lg">
          {/* Marque */}
          <div className="flex items-center justify-between px-gutter-sm">
            <span className="flex items-center gap-2.5 select-none" aria-label="SynTeX">
              <img src="/brand/syntex-mark.png" alt="" className="w-7 h-7 object-contain" />
              <span className="font-display text-title-lg text-on-surface">SynTeX</span>
            </span>
            <span className="font-mono text-code-sm text-outline" title="SynTeX v1 • moteur LaTeX WebAssembly">
              WASM
            </span>
          </div>

          <Button
            variant="primary"
            size="lg"
            icon={<Plus className="w-4 h-4" />}
            onClick={onNewProject}
            className="w-full"
          >
            Nouveau projet
          </Button>

          <nav aria-label="Navigation principale" className="flex flex-col gap-gutter-xs">
            <NavItem
              active={section === 'projects'}
              icon={<FolderOpen className="w-4 h-4" />}
              label={isAdmin ? 'Tous les projets' : 'Mes projets'}
              count={projectCount}
              onClick={() => onNavigate('projects')}
            />
            {isAdmin && (
              <NavItem
                active={section === 'users'}
                icon={<Users className="w-4 h-4" />}
                label="Utilisateurs"
                onClick={() => onNavigate('users')}
              />
            )}
          </nav>
        </div>

        <div className="flex flex-col gap-gutter-md pt-gutter-md border-t border-outline-variant">
          {storage && <StorageSummary storage={storage} isAdmin={isAdmin} />}

          <div className="flex items-center justify-between gap-2 px-gutter-xs">
            <span className="flex items-center gap-2 min-w-0" title={user.email}>
              <Avatar src={user.avatarUrl} name={user.name} size="md" />
              <span className="text-label-md text-on-surface truncate">{user.name}</span>
            </span>
            <span className="flex items-center shrink-0">
              <ThemeToggle size="sm" />
              <IconButton size="sm" label="Déconnexion" onClick={onLogout}>
                <LogOut className="w-3.5 h-3.5" />
              </IconButton>
            </span>
          </div>
        </div>
      </aside>

      <main className="min-w-0 w-full px-gutter-lg sm:px-gutter-xl py-gutter-xl">
        {/* Largeur de lecture confortable sur les très grands écrans */}
        <div className="mx-auto w-full max-w-[1400px]">{children}</div>
      </main>
    </div>
  );
};

const NavItem: React.FC<{
  active: boolean;
  icon: React.ReactNode;
  label: string;
  count?: number;
  onClick: () => void;
}> = ({ active, icon, label, count, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-current={active ? 'page' : undefined}
    className={cx(
      'h-9 px-2.5 rounded-lg flex items-center justify-between gap-2 text-label-lg transition-colors duration-100 ease-out',
      active
        ? 'bg-surface-container text-on-surface'
        : 'font-normal text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
    )}
  >
    <span className="flex items-center gap-2.5">
      <span className={active ? 'text-primary-text' : undefined}>{icon}</span>
      {label}
    </span>
    {count !== undefined && (
      <span className="font-mono text-code-sm text-on-surface-variant tabular-nums">{count}</span>
    )}
  </button>
);

/** Jauge d'espace disque (quota USER_QUOTA_MB, limite par fichier MAX_UPLOAD_MB). */
const StorageSummary: React.FC<{ storage: StorageUsage; isAdmin: boolean }> = ({
  storage,
  isAdmin,
}) => {
  const { usedBytes, quotaBytes, maxUploadBytes } = storage;
  const ratio = quotaRatio(usedBytes, quotaBytes);
  const over = quotaBytes !== null && usedBytes >= quotaBytes;
  const details =
    quotaBytes === null
      ? `Sans limite • fichiers jusqu'à ${formatBytes(maxUploadBytes)}`
      : `${formatBytes(Math.max(0, quotaBytes - usedBytes))} disponibles • fichiers jusqu'à ${formatBytes(maxUploadBytes)}`;

  return (
    <div className="flex flex-col gap-1.5 px-gutter-xs" aria-label="Espace de stockage" title={details}>
      <div className="flex items-center justify-between gap-2 text-label-md">
        <span className="text-on-surface-variant font-normal">
          {isAdmin ? 'Stockage de tes projets' : 'Stockage'}
        </span>
        <span className="font-mono text-code-sm text-on-surface tabular-nums">
          {quotaBytes === null
            ? formatBytes(usedBytes)
            : `${formatBytes(usedBytes)} / ${formatBytes(quotaBytes)}`}
        </span>
      </div>
      {ratio !== null && (
        <Meter ratio={ratio} minVisible={usedBytes > 0 ? 2 : 0} className="h-1" label="Stockage utilisé" />
      )}
      <p className={cx('text-label-sm font-normal', over ? 'text-error' : 'text-outline')}>
        {over ? 'Quota atteint : supprime des fichiers ou des projets.' : details}
      </p>
    </div>
  );
};
