import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

// Load .env from repo root or current working directory if present
for (const candidate of [path.join(repoRoot, '.env'), path.resolve(process.cwd(), '.env')]) {
  if (fs.existsSync(candidate)) {
    process.loadEnvFile(candidate);
    break;
  }
}

const isProd = process.env.NODE_ENV === 'production';

function parseList(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(/[,\s;]+/)
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

const googleClientId = (process.env.GOOGLE_CLIENT_ID ?? '').trim();
const googleClientSecret = (process.env.GOOGLE_CLIENT_SECRET ?? '').trim();
const adminEmails = parseList(process.env.ADMIN_EMAILS);
const allowedEmailDomains = parseList(process.env.ALLOWED_EMAIL_DOMAINS).map((d) =>
  d.replace(/^@/, '')
);

// URL publique par laquelle le navigateur accède à l'app (sert à construire le redirect_uri OAuth)
const publicUrl = (process.env.PUBLIC_URL ?? '').trim().replace(/\/+$/, '') ||
  (isProd ? '' : 'http://localhost:5173');

if (isProd) {
  const missing = [
    !googleClientId && 'GOOGLE_CLIENT_ID',
    !googleClientSecret && 'GOOGLE_CLIENT_SECRET',
    !publicUrl && 'PUBLIC_URL',
    adminEmails.length === 0 && 'ADMIN_EMAILS',
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new Error(`Variables manquantes dans .env en production : ${missing.join(', ')}`);
  }
} else if (!googleClientId || !googleClientSecret) {
  console.warn(
    '[SECURITY WARNING] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET absents : la connexion Google est désactivée.'
  );
}
if (adminEmails.length === 0) {
  console.warn('[SECURITY WARNING] ADMIN_EMAILS est vide : personne ne pourra valider les comptes.');
}

const dataDirInput = process.env.DATA_DIR || path.join(repoRoot, 'data');
const dataDir = path.isAbsolute(dataDirInput)
  ? dataDirInput
  : path.resolve(repoRoot, dataDirInput);

export const config = {
  isProd,
  port: Number.parseInt(process.env.PORT ?? '3000', 10) || 3000,
  host: process.env.HOST ?? '0.0.0.0',
  dataDir,
  projectsDir: path.join(dataDir, 'projects'),
  texCacheDir: path.join(dataDir, 'tex-cache'),
  webPublicDir: path.resolve(repoRoot, 'apps/web/public'),
  webDistDir: path.resolve(repoRoot, 'apps/web/dist'),
  publicUrl,
  google: {
    clientId: googleClientId,
    clientSecret: googleClientSecret,
    redirectUri: `${publicUrl}/api/auth/google/callback`,
  },
  adminEmails,
  allowedEmailDomains,
  sessionTtlMs: (Number.parseInt(process.env.SESSION_TTL_HOURS ?? '168', 10) || 168) * 3600 * 1000,
  trustProxy: (process.env.TRUST_PROXY ?? 'true').toLowerCase() === 'true',
  forceSecureCookie: (process.env.FORCE_SECURE_COOKIE ?? 'false').toLowerCase() === 'true',
  cookieName: 'prism_latex_session',
  oauthCookieName: 'prism_latex_oauth',
};
