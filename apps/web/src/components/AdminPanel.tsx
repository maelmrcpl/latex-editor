import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Crown, Loader2, RotateCcw, X } from 'lucide-react';
import type { AdminUserEntry, AuthUser, UserStatus } from '@prism-latex/shared';
import { api, ApiError } from '../lib/api';
import { formatBytes, quotaBarColor, quotaRatio } from '../lib/format';
import { SynTeXLogo } from './SynTeXLogo';

interface AdminPanelProps {
  currentUser: AuthUser;
  onBack: () => void;
}

const STATUS_LABEL: Record<UserStatus, string> = {
  pending: 'En attente',
  approved: 'Validé',
  rejected: 'Refusé',
};

const STATUS_STYLE: Record<UserStatus, string> = {
  pending: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  approved: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  rejected: 'bg-red-500/15 text-red-300 border-red-500/30',
};

const formatDate = (ts: number | null) =>
  ts
    ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(ts)
      )
    : '—';

export const AdminPanel: React.FC<AdminPanelProps> = ({ currentUser, onBack }) => {
  const [users, setUsers] = useState<AdminUserEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      !window.confirm(`Révoquer l'accès de ${target.email} ? Ses projets sont conservés.`)
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
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-900 bg-zinc-950/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <SynTeXLogo variant="full" showTagline />
          <button
            onClick={onBack}
            className="text-xs px-3 py-1.5 rounded-lg border border-zinc-800 hover:bg-zinc-900 text-zinc-300 flex items-center gap-1.5 transition cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Retour aux projets
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-white">Utilisateurs</h1>
        <p className="text-sm text-zinc-400 mt-1 mb-8">
          {pendingCount > 0
            ? `${pendingCount} demande${pendingCount > 1 ? 's' : ''} d'accès en attente.`
            : "Aucune demande d'accès en attente."}{' '}
          Les administrateurs se configurent via <code className="text-zinc-300">ADMIN_EMAILS</code>.
        </p>

        {error && (
          <div className="mb-4 px-3.5 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-sm text-zinc-500 py-16 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Chargement...
          </div>
        ) : (
          <div className="border border-zinc-800/80 rounded-2xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900/60 text-xs text-zinc-400 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Compte</th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                  <th className="px-4 py-3 font-medium hidden md:table-cell">Inscription</th>
                  <th className="px-4 py-3 font-medium hidden md:table-cell">Dernière connexion</th>
                  <th className="px-4 py-3 font-medium hidden sm:table-cell">Projets</th>
                  <th className="px-4 py-3 font-medium hidden sm:table-cell">Stockage</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70">
                {users.map((u) => {
                  const isAdmin = u.role === 'admin';
                  const busy = busyId === u.id;
                  return (
                    <tr key={u.id} className="hover:bg-zinc-900/40">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          {u.avatarUrl ? (
                            <img
                              src={u.avatarUrl}
                              alt=""
                              referrerPolicy="no-referrer"
                              className="w-7 h-7 rounded-full shrink-0"
                            />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-zinc-800 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <div className="text-zinc-100 truncate flex items-center gap-1.5">
                              {u.name}
                              {isAdmin && (
                                <Crown className="w-3.5 h-3.5 text-amber-400" aria-label="Admin" />
                              )}
                              {u.id === currentUser.id && (
                                <span className="text-[10px] text-zinc-500">(toi)</span>
                              )}
                            </div>
                            <div className="text-xs text-zinc-500 truncate">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded-full border ${STATUS_STYLE[u.status]}`}
                        >
                          {STATUS_LABEL[u.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-400 hidden md:table-cell">
                        {formatDate(u.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-400 hidden md:table-cell">
                        {formatDate(u.lastLoginAt)}
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-400 hidden sm:table-cell">
                        {u.projectCount}
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-400 hidden sm:table-cell">
                        <UserStorageCell used={u.storageBytes} quota={u.quotaBytes} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-500" />}
                          {!isAdmin && u.status !== 'approved' && (
                            <button
                              disabled={busy}
                              onClick={() => setStatus(u, 'approved')}
                              className="text-xs px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white flex items-center gap-1 transition cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                              Valider
                            </button>
                          )}
                          {!isAdmin && u.status !== 'rejected' && (
                            <button
                              disabled={busy}
                              onClick={() => setStatus(u, 'rejected')}
                              className="text-xs px-2.5 py-1 rounded-lg border border-zinc-700 hover:bg-red-500/15 hover:border-red-500/40 hover:text-red-300 disabled:opacity-50 text-zinc-300 flex items-center gap-1 transition cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                              {u.status === 'approved' ? 'Révoquer' : 'Refuser'}
                            </button>
                          )}
                          {!isAdmin && u.status === 'rejected' && (
                            <button
                              disabled={busy}
                              onClick={() => setStatus(u, 'pending')}
                              title="Remettre en attente"
                              className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 disabled:opacity-50 transition cursor-pointer"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
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
      </main>
    </div>
  );
};

const UserStorageCell: React.FC<{ used: number; quota: number | null }> = ({ used, quota }) => {
  const ratio = quotaRatio(used, quota);
  return (
    <div className="min-w-[7.5rem]">
      <div className="tabular-nums whitespace-nowrap">
        {formatBytes(used)}
        <span className="text-zinc-600">
          {quota === null ? ' • sans limite' : ` / ${formatBytes(quota)}`}
        </span>
      </div>
      {ratio !== null && (
        <div className="mt-1 h-1 w-24 rounded-full bg-zinc-800 overflow-hidden">
          <div
            className={`h-full rounded-full ${quotaBarColor(ratio)}`}
            style={{ width: `${Math.max(ratio * 100, used > 0 ? 2 : 0)}%` }}
          />
        </div>
      )}
    </div>
  );
};
