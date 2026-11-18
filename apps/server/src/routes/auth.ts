import { randomUUID } from 'node:crypto';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { config } from '../config.js';
import {
  generateRandomToken,
  generateSessionToken,
  hashSessionToken,
  pkceChallenge,
  safeCompareStrings,
} from '../crypto.js';
import { claimOrphanProjects, db, purgeExpiredSessions } from '../db.js';
import {
  type AppVariables,
  type DbUserRow,
  getClientIp,
  isHttpsRequest,
  requireAuth,
} from '../middleware/auth.js';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);
const OAUTH_COOKIE_PATH = '/api/auth/google';
const OAUTH_FLOW_TTL_SEC = 10 * 60;

interface OAuthFlowState {
  state: string;
  verifier: string;
  nonce: string;
}

interface GoogleIdTokenClaims {
  iss?: string;
  aud?: string;
  sub?: string;
  exp?: number;
  nonce?: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  picture?: string;
}

/** Codes d'erreur renvoyés au front via `/?auth_error=<code>` */
type AuthErrorCode =
  | 'not_configured'
  | 'state_mismatch'
  | 'access_denied'
  | 'token_exchange'
  | 'invalid_token'
  | 'email_unverified'
  | 'domain_not_allowed';

function isGoogleConfigured(): boolean {
  return Boolean(config.google.clientId && config.google.clientSecret);
}

function redirectWithError(c: Context, code: AuthErrorCode) {
  deleteCookie(c, config.oauthCookieName, { path: OAUTH_COOKIE_PATH });
  return c.redirect(`/?auth_error=${code}`, 302);
}

function decodeJwtPayload(jwt: string): GoogleIdTokenClaims | null {
  const parts = jwt.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as GoogleIdTokenClaims;
  } catch {
    return null;
  }
}

function emailDomain(email: string): string {
  return email.slice(email.lastIndexOf('@') + 1);
}

export const authRoutes = new Hono<{ Variables: AppVariables }>();

authRoutes.get('/config', (c) => c.json({ googleEnabled: isGoogleConfigured() }));

// Étape 1 : redirection vers l'écran de consentement Google (Authorization Code + PKCE)
authRoutes.get('/google/start', (c) => {
  if (!isGoogleConfigured()) {
    return redirectWithError(c, 'not_configured');
  }

  const flow: OAuthFlowState = {
    state: generateRandomToken(24),
    verifier: generateRandomToken(48),
    nonce: generateRandomToken(24),
  };

  setCookie(c, config.oauthCookieName, Buffer.from(JSON.stringify(flow)).toString('base64url'), {
    httpOnly: true,
    secure: isHttpsRequest(c),
    sameSite: 'Lax',
    path: OAUTH_COOKIE_PATH,
    maxAge: OAUTH_FLOW_TTL_SEC,
  });

  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: config.google.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state: flow.state,
    nonce: flow.nonce,
    code_challenge: pkceChallenge(flow.verifier),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });

  return c.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`, 302);
});

// Étape 2 : retour de Google, échange du code, création/mise à jour du compte et de la session
authRoutes.get('/google/callback', async (c) => {
  if (!isGoogleConfigured()) {
    return redirectWithError(c, 'not_configured');
  }

  const rawFlow = getCookie(c, config.oauthCookieName);
  let flow: OAuthFlowState | null = null;
  if (rawFlow) {
    try {
      flow = JSON.parse(Buffer.from(rawFlow, 'base64url').toString('utf8')) as OAuthFlowState;
    } catch {
      flow = null;
    }
  }

  const query = c.req.query();
  if (query.error) {
    return redirectWithError(c, 'access_denied');
  }
  if (
    !flow ||
    typeof flow.state !== 'string' ||
    !query.state ||
    !safeCompareStrings(query.state, flow.state) ||
    !query.code
  ) {
    return redirectWithError(c, 'state_mismatch');
  }

  // Échange du code contre les jetons (communication directe serveur -> Google en TLS)
  let idToken: string | undefined;
  try {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: query.code,
        client_id: config.google.clientId,
        client_secret: config.google.clientSecret,
        redirect_uri: config.google.redirectUri,
        grant_type: 'authorization_code',
        code_verifier: flow.verifier,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`[auth] Échange de code Google refusé (HTTP ${res.status})`);
      return redirectWithError(c, 'token_exchange');
    }
    const data = (await res.json()) as { id_token?: string };
    idToken = data.id_token;
  } catch (err) {
    console.error('[auth] Échange de code Google impossible :', (err as Error).message);
    return redirectWithError(c, 'token_exchange');
  }

  // L'id_token provient directement du token endpoint via TLS : la validation TLS remplace
  // la vérification de signature (OpenID Connect Core §3.1.3.7). On valide les claims.
  const claims = idToken ? decodeJwtPayload(idToken) : null;
  if (
    !claims ||
    !claims.sub ||
    !claims.email ||
    !GOOGLE_ISSUERS.has(claims.iss ?? '') ||
    claims.aud !== config.google.clientId ||
    typeof claims.exp !== 'number' ||
    claims.exp * 1000 <= Date.now() ||
    !claims.nonce ||
    !safeCompareStrings(claims.nonce, flow.nonce)
  ) {
    return redirectWithError(c, 'invalid_token');
  }
  if (claims.email_verified !== true && claims.email_verified !== 'true') {
    return redirectWithError(c, 'email_unverified');
  }

  const email = claims.email.trim().toLowerCase();
  const isAdminEmail = config.adminEmails.includes(email);
  if (
    !isAdminEmail &&
    config.allowedEmailDomains.length > 0 &&
    !config.allowedEmailDomains.includes(emailDomain(email))
  ) {
    return redirectWithError(c, 'domain_not_allowed');
  }

  const now = Date.now();
  const name = (claims.name ?? '').trim().slice(0, 120) || email;
  const avatarUrl =
    typeof claims.picture === 'string' && claims.picture.startsWith('https://')
      ? claims.picture.slice(0, 1024)
      : null;

  const existing = db
    .prepare('SELECT * FROM users WHERE google_sub = ? LIMIT 1')
    .get(claims.sub) as DbUserRow | undefined;

  let userId: string;
  // ADMIN_EMAILS (.env) est la source de vérité pour le rôle admin
  const role = isAdminEmail ? 'admin' : 'user';

  if (existing) {
    userId = existing.id;
    const status = isAdminEmail ? 'approved' : existing.status;
    db.prepare(
      `UPDATE users
       SET email = ?, name = ?, avatar_url = ?, role = ?, status = ?, updated_at = ?, last_login_at = ?
       WHERE id = ?`
    ).run(email, name, avatarUrl, role, status, now, now, userId);
  } else {
    userId = randomUUID();
    db.prepare(
      `INSERT INTO users (id, google_sub, email, name, avatar_url, role, status, created_at, updated_at, last_login_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      userId,
      claims.sub,
      email,
      name,
      avatarUrl,
      role,
      isAdminEmail ? 'approved' : 'pending',
      now,
      now,
      now
    );
    if (!isAdminEmail) {
      console.log(`[auth] Nouvelle demande d'accès : ${email} (en attente de validation)`);
    }
  }

  if (isAdminEmail) {
    // Rattache les projets hérités de la v1 mono-compte au premier admin connecté
    claimOrphanProjects(userId);
  }

  purgeExpiredSessions();

  const token = generateSessionToken();
  db.prepare(
    `INSERT INTO sessions (id, token_hash, user_id, ip, user_agent, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    randomUUID(),
    hashSessionToken(token),
    userId,
    getClientIp(c),
    (c.req.header('user-agent') ?? '').slice(0, 255),
    now,
    now + config.sessionTtlMs
  );

  deleteCookie(c, config.oauthCookieName, { path: OAUTH_COOKIE_PATH });
  setCookie(c, config.cookieName, token, {
    httpOnly: true,
    secure: isHttpsRequest(c),
    sameSite: 'Lax',
    path: '/',
    maxAge: Math.floor(config.sessionTtlMs / 1000),
  });

  return c.redirect('/', 302);
});

authRoutes.post('/logout', async (c) => {
  const rawToken = getCookie(c, config.cookieName);
  if (rawToken) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashSessionToken(rawToken));
  }
  deleteCookie(c, config.cookieName, { path: '/' });
  return c.json({ ok: true });
});

authRoutes.get('/me', requireAuth, (c) => {
  return c.json({ user: c.get('user') });
});
