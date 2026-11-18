import React, { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { SynTeXLogo } from './SynTeXLogo';

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
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* SynTeX brand radial glow */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[650px] h-[380px] bg-[#5236FF]/20 blur-[130px] rounded-full" />

      <div className="w-full max-w-md bg-zinc-900/80 backdrop-blur-xl border border-zinc-800/90 rounded-2xl shadow-2xl p-8 relative z-10">
        <div className="mb-7">
          <SynTeXLogo variant="stacked" showTagline />
        </div>

        <div className="space-y-4">
          <p className="text-sm text-zinc-400 text-center">
            Connecte-toi avec ton compte Google. Les nouveaux comptes doivent être validés par
            l'administrateur avant de pouvoir utiliser SynTeX.
          </p>

          {(error || !googleEnabled) && (
            <div className="px-3.5 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300">
              {error ?? AUTH_ERROR_MESSAGES.not_configured}
            </div>
          )}

          <a
            href={api.auth.googleStartUrl}
            aria-disabled={!googleEnabled}
            className={`w-full py-2.5 px-4 rounded-xl bg-white hover:bg-zinc-100 text-sm font-medium text-zinc-900 flex items-center justify-center gap-2.5 shadow-lg transition ${
              googleEnabled ? '' : 'opacity-50 pointer-events-none'
            }`}
          >
            <GoogleIcon />
            Continuer avec Google
          </a>
        </div>

        <div className="mt-6 pt-5 border-t border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-500">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Accès sur validation
          </span>
          <span className="font-mono text-zinc-600">SynTeX • WASM</span>
        </div>
      </div>
    </div>
  );
};
