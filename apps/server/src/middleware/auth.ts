import type { Context, MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { config } from '../config.js';
import { hashSessionToken } from '../crypto.js';
import { db } from '../db.js';

export interface AppVariables {
  username: string;
  sessionId: string;
}

export function getClientIp(c: Context): string {
  if (config.trustProxy) {
    const xff = c.req.header('x-forwarded-for');
    if (xff) {
      const first = xff.split(',')[0]?.trim();
      if (first) return first;
    }
    const realIp = c.req.header('x-real-ip')?.trim();
    if (realIp) return realIp;
  }
  return 'local';
}

export function isHttpsRequest(c: Context): boolean {
  if (config.forceSecureCookie) return true;
  if (config.trustProxy) {
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
      const forwardedHost = config.trustProxy
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

export const requireAuth: MiddlewareHandler<{ Variables: AppVariables }> = async (c, next) => {
  const rawToken = getCookie(c, config.cookieName);
  if (!rawToken) {
    return c.json({ error: 'Authentification requise.' }, 401);
  }

  const tokenHash = hashSessionToken(rawToken);
  const row = db
    .prepare(
      'SELECT id, username, expires_at FROM sessions WHERE token_hash = ? LIMIT 1'
    )
    .get(tokenHash) as { id: string; username: string; expires_at: number } | undefined;

  if (!row || row.expires_at <= Date.now()) {
    if (row) {
      db.prepare('DELETE FROM sessions WHERE id = ?').run(row.id);
    }
    return c.json({ error: 'Session expirée ou invalide.' }, 401);
  }

  c.set('username', row.username);
  c.set('sessionId', row.id);
  return next();
};
