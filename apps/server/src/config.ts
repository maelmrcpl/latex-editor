import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from './crypto.js';

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

const rawUsername = (process.env.ADMIN_USERNAME ?? '').trim();
const rawPassword = process.env.ADMIN_PASSWORD ?? '';
const rawPasswordHash = (process.env.ADMIN_PASSWORD_HASH ?? '').trim();

if (isProd && !rawUsername) {
  throw new Error('ADMIN_USERNAME doit être défini dans .env en production.');
}
if (isProd && !rawPasswordHash && (!rawPassword || rawPassword === 'change-me-strong-password')) {
  throw new Error(
    'ADMIN_PASSWORD_HASH (ou un ADMIN_PASSWORD fort) doit être défini dans .env en production.'
  );
}

const adminUsername = rawUsername || 'admin';
let adminPasswordHash = rawPasswordHash;

if (!adminPasswordHash) {
  const effectivePassword = rawPassword || 'prism-dev-local';
  if (!rawPassword) {
    console.warn(
      `[SECURITY WARNING] Aucun ADMIN_PASSWORD / ADMIN_PASSWORD_HASH détecté dans .env. ` +
        `Mode développement actif avec identifiants temporaires : ${adminUsername} / ${effectivePassword}`
    );
  }
  adminPasswordHash = hashPassword(effectivePassword);
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
  adminUsername,
  adminPasswordHash,
  sessionTtlMs: (Number.parseInt(process.env.SESSION_TTL_HOURS ?? '168', 10) || 168) * 3600 * 1000,
  trustProxy: (process.env.TRUST_PROXY ?? 'true').toLowerCase() === 'true',
  forceSecureCookie: (process.env.FORCE_SECURE_COOKIE ?? 'false').toLowerCase() === 'true',
  cookieName: 'prism_latex_session',
};
