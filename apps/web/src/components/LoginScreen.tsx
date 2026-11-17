import React, { useState } from 'react';
import { Lock, LogIn, ShieldCheck } from 'lucide-react';
import type { AuthUser } from '@prism-latex/shared';
import { api, ApiError } from '../lib/api';
import { SynTeXLogo } from './SynTeXLogo';

interface LoginScreenProps {
  onAuthenticated: (user: AuthUser) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onAuthenticated }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.auth.login(username.trim(), password);
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Connexion impossible.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* SynTeX brand radial glow */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[650px] h-[380px] bg-[#5236FF]/20 blur-[130px] rounded-full" />

      <div className="w-full max-w-md bg-zinc-900/80 backdrop-blur-xl border border-zinc-800/90 rounded-2xl shadow-2xl p-8 relative z-10">
        <div className="mb-7">
          <SynTeXLogo variant="stacked" showTagline />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Identifiant
            </label>
            <input
              type="text"
              autoComplete="username"
              autoFocus
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Identifiant administrateur"
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-[#634BFF] focus:ring-1 focus:ring-[#634BFF] transition"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Mot de passe
            </label>
            <div className="relative">
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-[#634BFF] focus:ring-1 focus:ring-[#634BFF] transition"
              />
              <Lock className="w-4 h-4 text-zinc-600 absolute right-3.5 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          {error && (
            <div className="px-3.5 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-xl bg-[#5236FF] hover:bg-[#634BFF] disabled:opacity-50 text-sm font-medium text-white flex items-center justify-center gap-2 shadow-lg shadow-[#5236FF]/25 transition cursor-pointer"
          >
            <LogIn className="w-4 h-4" />
            {loading ? 'Vérification...' : 'Se connecter à SynTeX'}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-500">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Accès mono-compte verrouillé
          </span>
          <span className="font-mono text-zinc-600">SynTeX • WASM</span>
        </div>
      </div>
    </div>
  );
};
