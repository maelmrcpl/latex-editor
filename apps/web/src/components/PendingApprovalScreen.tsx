import React, { useState } from 'react';
import { Ban, Hourglass, LogOut, RefreshCw } from 'lucide-react';
import type { AuthUser } from '@prism-latex/shared';
import { api } from '../lib/api';
import { SynTeXLogo } from './SynTeXLogo';

interface PendingApprovalScreenProps {
  user: AuthUser;
  onUserUpdated: (user: AuthUser) => void;
  onLogout: () => void;
}

export const PendingApprovalScreen: React.FC<PendingApprovalScreenProps> = ({
  user,
  onUserUpdated,
  onLogout,
}) => {
  const [checking, setChecking] = useState(false);
  const rejected = user.status === 'rejected';

  const recheck = async () => {
    setChecking(true);
    try {
      const res = await api.auth.me();
      onUserUpdated(res.user);
    } catch {
      // Ignore: user stays on this screen
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[650px] h-[380px] bg-[#5236FF]/20 blur-[130px] rounded-full" />

      <div className="w-full max-w-md bg-zinc-900/80 backdrop-blur-xl border border-zinc-800/90 rounded-2xl shadow-2xl p-8 relative z-10">
        <div className="mb-7">
          <SynTeXLogo variant="stacked" showTagline />
        </div>

        <div className="flex flex-col items-center text-center gap-3">
          {rejected ? (
            <Ban className="w-9 h-9 text-red-400" />
          ) : (
            <Hourglass className="w-9 h-9 text-amber-400" />
          )}
          <h1 className="text-lg font-semibold text-white">
            {rejected ? 'Accès refusé' : 'Compte en attente de validation'}
          </h1>
          <p className="text-sm text-zinc-400">
            {rejected
              ? "L'administrateur n'a pas autorisé ce compte à utiliser SynTeX."
              : "Ta demande d'accès a bien été enregistrée. Un administrateur doit la valider avant que tu puisses utiliser SynTeX."}
          </p>

          <div className="mt-1 flex items-center gap-2.5 px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-300">
            {user.avatarUrl && (
              <img
                src={user.avatarUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="w-6 h-6 rounded-full"
              />
            )}
            <span>{user.email}</span>
          </div>
        </div>

        <div className="mt-6 pt-5 border-t border-zinc-800/80 flex items-center justify-between gap-2">
          <button
            onClick={onLogout}
            className="text-xs px-3 py-1.5 rounded-lg border border-zinc-800 hover:bg-zinc-900 text-zinc-300 flex items-center gap-1.5 transition cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Changer de compte
          </button>
          {!rejected && (
            <button
              onClick={recheck}
              disabled={checking}
              className="text-xs px-3 py-1.5 rounded-lg bg-[#5236FF] hover:bg-[#634BFF] disabled:opacity-50 text-white flex items-center gap-1.5 transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
              Vérifier à nouveau
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
