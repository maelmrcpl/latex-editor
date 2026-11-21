import React, { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { AuthCard } from './AuthCard';
import { Alert, Button } from './ui';

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  not_configured:
    "La connexion Google n'est pas configurée sur ce serveur (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).",
  state_mismatch: 'La tentative de connexion a expiré ou est invalide. Réessaie.',
  access_denied: 'Connexion Google annulée.',
  token_exchange: 'Google a refusé la connexion. Réessaie dans un instant.',
  invalid_token: 'Réponse de Google invalide. Réessaie.',
  email_unverified: "L'adresse email de ce compte Google n'est pas vérifiée.",
  domain_not_allowed: "Les comptes de ce domaine ne sont pas autorisés à s'inscrire.",
};

/** Lit puis retire `?auth_error=` de l'URL (posé par le callback OAuth du serveur). */
function consumeAuthError(): string | null {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('auth_error');
  if (!code) return null;
  url.searchParams.delete('auth_error');
  window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  return AUTH_ERROR_MESSAGES[code] ?? 'Connexion impossible.';
}

const GoogleIcon: React.FC = () => (
  <svg className="w-4 h-4" viewBox="0 0 48 48" aria-hidden="true">
    <path
      fill="#FFC107"
      d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
    />
    <path
      fill="#FF3D00"
      d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
    />
    <path
      fill="#4CAF50"
      d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
    />
    <path
      fill="#1976D2"
      d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
    />
  </svg>
);

export const LoginScreen: React.FC = () => {
  const [error] = useState<string | null>(consumeAuthError);
  const [googleEnabled, setGoogleEnabled] = useState(true);

  useEffect(() => {
    api.auth
      .config()
      .then((cfg) => setGoogleEnabled(cfg.googleEnabled))
      .catch(() => {});
  }, []);

  return (
    <AuthCard
      footer={
        <>
          <span className="flex items-center gap-1.5 text-label-sm text-on-surface-variant">
            <ShieldCheck className="w-3.5 h-3.5 text-success" />
            Accès sur validation
          </span>
          <span className="font-mono text-code-sm text-outline">SynTeX • WASM</span>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-body-md text-on-surface-variant text-center">
          Connecte-toi avec ton compte Google. Les nouveaux comptes doivent être validés par
          l'administrateur avant de pouvoir utiliser SynTeX.
        </p>

        {(error || !googleEnabled) && <Alert>{error ?? AUTH_ERROR_MESSAGES.not_configured}</Alert>}

        <Button
          href={api.auth.googleStartUrl}
          aria-disabled={!googleEnabled}
          size="lg"
          variant="secondary"
          icon={<GoogleIcon />}
          className="w-full"
        >
          Continuer avec Google
        </Button>
      </div>
    </AuthCard>
  );
};
