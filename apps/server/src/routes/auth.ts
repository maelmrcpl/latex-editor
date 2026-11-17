import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { config } from '../config.js';
import {
  generateSessionToken,
  hashSessionToken,
  safeCompareStrings,
  verifyPassword,
} from '../crypto.js';
import { db, purgeExpiredSessions } from '../db.js';
import {
  type AppVariables,
  getClientIp,
  isHttpsRequest,
  requireAuth,
} from '../middleware/auth.js';

interface RateLimitBucket {
  failures: number;
  resetAt: number;
}

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const loginAttempts = new Map<string, RateLimitBucket>();

function checkRateLimit(ip: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || entry.resetAt <= now) {
    return { allowed: true, retryAfterSec: 0 };
  }
  if (entry.failures >= MAX_ATTEMPTS) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    };
  }
  return { allowed: true, retryAfterSec: 0 };
}

function recordFailedAttempt(ip: string): void {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || entry.resetAt <= now) {
    loginAttempts.set(ip, { failures: 1, resetAt: now + WINDOW_MS });
  } else {
    entry.failures += 1;
  }
}

export const authRoutes = new Hono<{ Variables: AppVariables }>();

// Mono-compte : uniquement /login, /logout et /me (aucune création de compte)
authRoutes.post('/login', async (c) => {
  const ip = getClientIp(c);
  const rate = checkRateLimit(ip);
  if (!rate.allowed) {
    c.header('Retry-After', String(rate.retryAfterSec));
    return c.json(
      {
        error: `Trop de tentatives échouées. Réessaie dans ${Math.ceil(rate.retryAfterSec / 60)} min.`,
      },
      429
    );
  }

  let body: { username?: string; password?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Corps JSON invalide.' }, 400);
  }

  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!username || !password || password.length > 512) {
    return c.json({ error: 'Identifiant et mot de passe requis.' }, 400);
  }

  // Toujours exécuter les deux vérifications pour éviter toute fuite temporelle sur l'identifiant
  const usernameOk = safeCompareStrings(username, config.adminUsername);
  const passwordOk = verifyPassword(password, config.adminPasswordHash);

  if (!usernameOk || !passwordOk) {
    recordFailedAttempt(ip);
    return c.json({ error: 'Identifiants invalides.' }, 401);
  }

  loginAttempts.delete(ip);
  purgeExpiredSessions();

  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const now = Date.now();
  const expiresAt = now + config.sessionTtlMs;
  const sessionId = randomUUID();

  db.prepare(
    `INSERT INTO sessions (id, token_hash, username, ip, user_agent, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    sessionId,
    tokenHash,
    config.adminUsername,
    ip,
    (c.req.header('user-agent') ?? '').slice(0, 255),
    now,
    expiresAt
  );

  setCookie(c, config.cookieName, token, {
    httpOnly: true,
    secure: isHttpsRequest(c),
    sameSite: 'Lax',
    path: '/',
    maxAge: Math.floor(config.sessionTtlMs / 1000),
  });

  return c.json({
    user: { username: config.adminUsername },
  });
});

authRoutes.post('/logout', async (c) => {
  const rawToken = getCookie(c, config.cookieName);
  if (rawToken) {
    const tokenHash = hashSessionToken(rawToken);
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
  }
  deleteCookie(c, config.cookieName, { path: '/' });
  return c.json({ ok: true });
});

authRoutes.get('/me', requireAuth, (c) => {
  return c.json({
    user: { username: c.get('username') },
  });
});
