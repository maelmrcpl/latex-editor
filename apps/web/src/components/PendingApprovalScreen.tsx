import React, { useState } from 'react';
import { Ban, Hourglass, LogOut, RefreshCw } from 'lucide-react';
import type { AuthUser } from '@prism-latex/shared';
import { api } from '../lib/api';
import { AuthCard } from './AuthCard';
import { Avatar, Button } from './ui';

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
    <AuthCard
      footer={
        <>
          <Button variant="ghost" size="sm" icon={<LogOut className="w-3.5 h-3.5" />} onClick={onLogout}>
            Changer de compte
          </Button>
          {!rejected && (
            <Button
              variant="primary"
              size="sm"
              onClick={recheck}
              disabled={checking}
              icon={<RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />}
            >
              Vérifier à nouveau
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col items-center text-center gap-3">
        <span
          className={`w-10 h-10 rounded-full flex items-center justify-center ${
            rejected
              ? 'bg-error-container text-on-error-container'
              : 'bg-warning-container text-on-warning-container'
          }`}
        >
          {rejected ? <Ban className="w-5 h-5" /> : <Hourglass className="w-5 h-5" />}
        </span>
        <h1 className="font-display text-headline-md text-on-surface">
          {rejected ? 'Accès refusé' : 'Compte en attente de validation'}
        </h1>
        <p className="text-body-md text-on-surface-variant">
          {rejected
            ? "L'administrateur n'a pas autorisé ce compte à utiliser SynTeX."
            : "Ta demande d'accès a bien été enregistrée. Un administrateur doit la valider avant que tu puisses utiliser SynTeX."}
        </p>

        <div className="mt-1 flex items-center gap-2 h-9 px-3 rounded-lg bg-surface-container-low border border-outline-variant text-body-sm text-on-surface">
          <Avatar src={user.avatarUrl} />
          <span className="truncate">{user.email}</span>
        </div>
      </div>
    </AuthCard>
  );
};
