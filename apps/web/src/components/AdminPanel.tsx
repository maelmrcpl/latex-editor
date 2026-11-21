import React, { useEffect, useMemo, useState } from 'react';
import { Check, Crown, RotateCcw, X } from 'lucide-react';
import type { AdminUserEntry, AuthUser, UserStatus } from '@prism-latex/shared';
import { api, ApiError } from '../lib/api';
import { formatBytes, quotaRatio } from '../lib/format';
import { AppShell } from './AppShell';
import { useDialogs } from './ui/Dialog';
import { Alert, Avatar, Badge, Button, IconButton, Meter, Spinner, StatusDot, type Tone } from './ui';

interface AdminPanelProps {
  currentUser: AuthUser;
  onBack: () => void;
  onNewProject: () => void;
  onLogout: () => void;
}

const STATUS_LABEL: Record<UserStatus, string> = {
  pending: 'En attente',
  approved: 'Validé',
  rejected: 'Refusé',
};

const STATUS_TONE: Record<UserStatus, Tone> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
};

const formatDate = (ts: number | null) =>
  ts
    ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(ts)
      )
    : '—';

export const AdminPanel: React.FC<AdminPanelProps> = ({
  currentUser,
  onBack,
  onNewProject,
  onLogout,
}) => {
  const [users, setUsers] = useState<AdminUserEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dialogs = useDialogs();

  useEffect(() => {
    api.admin
      .listUsers()
      .then((res) => setUsers(res.users))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Chargement impossible.'))
      .finally(() => setLoading(false));
  }, []);

  const pendingCount = useMemo(() => users.filter((u) => u.status === 'pending').length, [users]);

  const setStatus = async (target: AdminUserEntry, status: UserStatus) => {
    if (
      status === 'rejected' &&
      target.status === 'approved' &&
      !(await dialogs.confirm({
        title: "Révoquer l'accès ?",
        message: `${target.email} ne pourra plus utiliser SynTeX. Ses projets sont conservés.`,
        confirmLabel: 'Révoquer',
        tone: 'danger',
      }))
    ) {
      return;
    }
    setBusyId(target.id);
    setError(null);
    try {
      const res = await api.admin.setUserStatus(target.id, status);
      setUsers((prev) => prev.map((u) => (u.id === target.id ? res.user : u)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action impossible.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AppShell
      user={currentUser}
      section="users"
      onNewProject={onNewProject}
      onNavigate={(section) => {
        if (section === 'projects') onBack();
      }}
      onLogout={onLogout}
    >
      <div>
        <h1 className="font-display text-headline-lg text-on-surface">Utilisateurs</h1>
        <p className="text-body-sm text-on-surface-variant mt-0.5 mb-gutter-xl">
          {pendingCount > 0
            ? `${pendingCount} demande${pendingCount > 1 ? 's' : ''} d'accès en attente.`
            : "Aucune demande d'accès en attente."}{' '}
          Les administrateurs se configurent via{' '}
          <code className="font-mono text-code-sm text-on-surface">ADMIN_EMAILS</code>.
        </p>

        {error && <Alert className="mb-gutter-md">{error}</Alert>}

        {loading ? (
          <div className="py-16 flex items-center justify-center gap-2 text-body-md text-on-surface-variant">
            <Spinner />
            Chargement...
          </div>
        ) : (
          <div className="border border-outline-variant rounded-xl overflow-x-auto bg-surface">
            <table className="w-full text-body-md [&_th]:whitespace-nowrap">
              <thead className="border-b border-outline-variant font-mono text-code-sm uppercase tracking-wider text-on-surface-variant text-left">
                <tr>
                  <th className="px-gutter-md py-2.5 font-medium">Compte</th>
                  <th className="px-gutter-md py-2.5 font-medium">Statut</th>
                  <th className="px-gutter-md py-2.5 font-medium hidden md:table-cell">Inscription</th>
                  <th className="px-gutter-md py-2.5 font-medium hidden md:table-cell">Dernière connexion</th>
                  <th className="px-gutter-md py-2.5 font-medium hidden sm:table-cell">Projets</th>
                  <th className="px-gutter-md py-2.5 font-medium hidden sm:table-cell">Stockage</th>
                  <th className="px-gutter-md py-2.5 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {users.map((u) => {
                  const isAdmin = u.role === 'admin';
                  const busy = busyId === u.id;
                  return (
                    <tr key={u.id} className="hover:bg-surface-container transition-colors duration-100">
                      <td className="px-gutter-md py-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar src={u.avatarUrl} name={u.name} size="md" />
                          <div className="min-w-0">
                            <div className="text-title-md text-on-surface truncate flex items-center gap-1.5">
                              {u.name}
                              {isAdmin && (
                                <Badge tone="primary" icon={<Crown className="w-3 h-3" />}>
                                  Admin
                                </Badge>
                              )}
                              {u.id === currentUser.id && (
                                <span className="text-label-sm text-outline">(toi)</span>
                              )}
                            </div>
                            <div className="text-body-sm text-on-surface-variant truncate">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-gutter-md py-3">
                        <StatusDot tone={STATUS_TONE[u.status]} className="whitespace-nowrap">{STATUS_LABEL[u.status]}</StatusDot>
                      </td>
                      <td className="px-gutter-md py-3 text-body-sm text-on-surface-variant tabular-nums whitespace-nowrap hidden md:table-cell">
                        {formatDate(u.createdAt)}
                      </td>
                      <td className="px-gutter-md py-3 text-body-sm text-on-surface-variant tabular-nums whitespace-nowrap hidden md:table-cell">
                        {formatDate(u.lastLoginAt)}
                      </td>
                      <td className="px-gutter-md py-3 text-body-sm text-on-surface-variant tabular-nums hidden sm:table-cell">
                        {u.projectCount}
                      </td>
                      <td className="px-gutter-md py-3 text-body-sm text-on-surface-variant hidden sm:table-cell">
                        <UserStorageCell used={u.storageBytes} quota={u.quotaBytes} />
                      </td>
                      <td className="px-gutter-md py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {busy && <Spinner className="w-3.5 h-3.5" />}
                          {!isAdmin && u.status !== 'approved' && (
                            <Button
                              size="sm"
                              variant="success"
                              disabled={busy}
                              onClick={() => void setStatus(u, 'approved')}
                              icon={<Check className="w-3.5 h-3.5" />}
                            >
                              Valider
                            </Button>
                          )}
                          {!isAdmin && u.status !== 'rejected' && (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={busy}
                              onClick={() => void setStatus(u, 'rejected')}
                              icon={<X className="w-3.5 h-3.5" />}
                              className="hover:bg-error-container hover:text-on-error-container hover:border-transparent"
                            >
                              {u.status === 'approved' ? 'Révoquer' : 'Refuser'}
                            </Button>
                          )}
                          {!isAdmin && u.status === 'rejected' && (
                            <IconButton
                              size="sm"
                              label="Remettre en attente"
                              disabled={busy}
                              onClick={() => void setStatus(u, 'pending')}
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </IconButton>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
};

const UserStorageCell: React.FC<{ used: number; quota: number | null }> = ({ used, quota }) => {
  const ratio = quotaRatio(used, quota);
  return (
    <div className="min-w-[7.5rem]">
      <div className="tabular-nums whitespace-nowrap">
        {formatBytes(used)}
        <span className="text-outline">
          {quota === null ? ' • sans limite' : ` / ${formatBytes(quota)}`}
        </span>
      </div>
      {ratio !== null && (
        <Meter ratio={ratio} minVisible={used > 0 ? 2 : 0} className="mt-1 h-1 w-24" />
      )}
    </div>
  );
};
