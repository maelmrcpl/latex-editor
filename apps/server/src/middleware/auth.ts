import type { Context, MiddlewareHandler } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import { getCookie } from 'hono/cookie';
import type { AuthUser, UserRole, UserStatus } from '@prism-latex/shared';
import { config } from '../config.js';
import { hashSessionToken } from '../crypto.js';
import { db } from '../db.js';

export interface AppVariables {
  user: AuthUser;
  sessionId: string;
}

export interface DbUserRow {
  id: string;
  google_sub: string;
  email: string;
  name: string;
  avatar_url: string | null;
  role: UserRole;
  status: UserStatus;
  created_at: number;
  updated_at: number;
  last_login_at: number | null;
  reviewed_at: number | null;
  reviewed_by: string | null;
}

export function mapAuthUser(row: DbUserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatar_url,
    role: row.role,
    status: row.status,
  };
}

/** Adresse IP de la connexion TCP (le reverse-proxy quand il y en a un). */
function socketAddress(c: Context): string | null {
  try {
    const address = getConnInfo(c).remote.address;
    return address ? address.replace(/^::ffff:/, '') : null;
  } catch {
    return null;
  }
}

/**
 * Les en-têtes X-Forwarded-* ne sont pris en compte que si TRUST_PROXY=true et, quand
 * TRUSTED_PROXY_IPS est renseigné, que la connexion vient bien de l'un de ces proxys.
 */
export function trustsProxyHeaders(c: Context): boolean {
  if (!config.trustProxy) return false;
  if (config.trustedProxyIps.length === 0) return true;
  const address = socketAddress(c);
  return address !== null && config.trustedProxyIps.includes(address);
}

export function getClientIp(c: Context): string {
  if (trustsProxyHeaders(c)) {
    // Dernière entrée : celle ajoutée par notre proxy (les précédentes viennent du client)
    const xff = c.req.header('x-forwarded-for');
    if (xff) {
      const last = xff.split(',').at(-1)?.trim();
      if (last) return last;
    }
    const realIp = c.req.header('x-real-ip')?.trim();
    if (realIp) return realIp;
  }
  return socketAddress(c) ?? 'local';
}

export function isHttpsRequest(c: Context): boolean {
  if (config.forceSecureCookie) return true;
  if (trustsProxyHeaders(c)) {
    const proto = c.req.header('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
    if (proto === 'https') return true;
  }
  try {
    return new URL(c.req.url).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * CSRF protection for cookie-authenticated mutating API requests.
 */
export const csrfMiddleware: MiddlewareHandler = async (c, next) => {
  const method = c.req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return next();
  }

  const origin = c.req.header('origin');
  if (origin) {
    try {
      const originHost = new URL(origin).host.toLowerCase();
      const forwardedHost = trustsProxyHeaders(c)
        ? c.req.header('x-forwarded-host')?.split(',')[0]?.trim().toLowerCase()
        : undefined;
      const host = (forwardedHost || c.req.header('host') || '').toLowerCase();
      // In local Vite dev, frontend on :5173 proxies to :3000; allow localhost dev ports only in non-prod
      const isLocalDev =
        !config.isProd &&
        (originHost.startsWith('localhost:') || originHost.startsWith('127.0.0.1:'));
      if (host && originHost !== host && !isLocalDev) {
        return c.json({ error: 'Requête cross-origin refusée (CSRF).' }, 403);
      }
    } catch {
      return c.json({ error: 'En-tête Origin invalide.' }, 403);
    }
  }

  return next();
};

/**
 * Requires a valid session. Pending / rejected users are authenticated too (so they can see
 * their status and log out) — use requireApproved to gate the actual service.
 */
export const requireAuth: MiddlewareHandler<{ Variables: AppVariables }> = async (c, next) => {
  const rawToken = getCookie(c, config.cookieName);
  if (!rawToken) {
    return c.json({ error: 'Authentification requise.' }, 401);
  }

  const tokenHash = hashSessionToken(rawToken);
  const row = db
    .prepare(
      `SELECT s.id AS session_id, s.expires_at, u.*
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? LIMIT 1`
    )
    .get(tokenHash) as (DbUserRow & { session_id: string; expires_at: number }) | undefined;

  if (!row || row.expires_at <= Date.now()) {
    if (row) {
      db.prepare('DELETE FROM sessions WHERE id = ?').run(row.session_id);
    }
    return c.json({ error: 'Session expirée ou invalide.' }, 401);
  }

  // ADMIN_EMAILS (.env) est la source de vérité du rôle admin, appliquée à chaque requête :
  // retirer un email de la liste rétrograde immédiatement ses sessions en cours.
  const shouldBeAdmin = config.adminEmails.includes(row.email.toLowerCase());
  if (shouldBeAdmin !== (row.role === 'admin')) {
    row.role = shouldBeAdmin ? 'admin' : 'user';
    if (shouldBeAdmin) row.status = 'approved';
    db.prepare('UPDATE users SET role = ?, status = ?, updated_at = ? WHERE id = ?').run(
      row.role,
      row.status,
      Date.now(),
      row.id
    );
    console.log(`[auth] Rôle de ${row.email} synchronisé avec ADMIN_EMAILS -> ${row.role}`);
  }

  c.set('user', mapAuthUser(row));
  c.set('sessionId', row.session_id);
  return next();
};

/**
 * Au démarrage : rétrograde les comptes admin dont l'email n'est plus dans ADMIN_EMAILS
 * (pour que le panneau Utilisateurs reflète la config, même sans requête de leur part).
 */
export function syncAdminRolesWithConfig(): void {
  const admins = db.prepare("SELECT id, email FROM users WHERE role = 'admin'").all() as Array<{
    id: string;
    email: string;
  }>;
  const demote = db.prepare("UPDATE users SET role = 'user', updated_at = ? WHERE id = ?");
  for (const admin of admins) {
    if (!config.adminEmails.includes(admin.email.toLowerCase())) {
      demote.run(Date.now(), admin.id);
      console.log(`[auth] ${admin.email} n'est plus dans ADMIN_EMAILS : rôle admin retiré.`);
    }
  }
}

/** Must run after requireAuth. Blocks accounts not (yet) validated by an admin. */
export const requireApproved: MiddlewareHandler<{ Variables: AppVariables }> = async (c, next) => {
  const user = c.get('user');
  if (user.status !== 'approved') {
    return c.json(
      {
        error:
          user.status === 'rejected'
            ? "Ton accès a été refusé par l'administrateur."
            : "Ton compte est en attente de validation par l'administrateur.",
      },
      403
    );
  }
  return next();
};

/** Must run after requireAuth. */
export const requireAdmin: MiddlewareHandler<{ Variables: AppVariables }> = async (c, next) => {
  const user = c.get('user');
  if (user.role !== 'admin' || user.status !== 'approved') {
    return c.json({ error: 'Accès réservé aux administrateurs.' }, 403);
  }
  return next();
};
