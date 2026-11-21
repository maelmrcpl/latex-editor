import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(config.projectsDir, { recursive: true });
fs.mkdirSync(config.texCacheDir, { recursive: true });

const dbPath = path.join(config.dataDir, 'prism-latex.sqlite');
export const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA synchronous = NORMAL;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    google_sub TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    avatar_url TEXT,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_login_at INTEGER,
    reviewed_at INTEGER,
    reviewed_by TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    root_file TEXT NOT NULL DEFAULT 'main.tex',
    compiler TEXT NOT NULL DEFAULT 'pdflatex',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS project_files (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    is_binary INTEGER NOT NULL DEFAULT 0,
    mime_type TEXT NOT NULL DEFAULT 'text/plain',
    size INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    UNIQUE(project_id, path)
  );

  CREATE INDEX IF NOT EXISTS idx_project_files_project ON project_files(project_id);
`);

function tableColumns(table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return new Set(rows.map((r) => r.name));
}

// --- Migration v1 (mono-compte) -> comptes Google ---
// L'ancienne table sessions était liée à un nom d'utilisateur : on la recrée (déconnecte tout le monde).
const sessionCols = tableColumns('sessions');
if (sessionCols.size > 0 && !sessionCols.has('user_id')) {
  db.exec('DROP TABLE sessions;');
}
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ip TEXT,
    user_agent TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`);

// Les projets appartiennent désormais à un utilisateur. Les projets existants (owner_id NULL)
// sont rattachés au premier administrateur qui se connecte (voir claimOrphanProjects).
if (!tableColumns('projects').has('owner_id')) {
  db.exec('ALTER TABLE projects ADD COLUMN owner_id TEXT REFERENCES users(id) ON DELETE SET NULL;');
}
db.exec('CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);');

// Projets épinglés en tête de la bibliothèque
if (!tableColumns('projects').has('pinned')) {
  db.exec('ALTER TABLE projects ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;');
}

export function claimOrphanProjects(adminUserId: string): void {
  db.prepare('UPDATE projects SET owner_id = ? WHERE owner_id IS NULL').run(adminUserId);
}

export function purgeExpiredSessions(): void {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
}

/** Espace disque occupé par tous les projets d'un utilisateur (octets). */
export function getUserStorageBytes(userId: string): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(f.size), 0) AS total
       FROM project_files f JOIN projects p ON p.id = f.project_id
       WHERE p.owner_id = ?`
    )
    .get(userId) as { total: number };
  return Number(row.total) || 0;
}

/** Quota applicable à un rôle (octets), ou null si illimité (admins, ou USER_QUOTA_MB=0). */
export function getQuotaBytesForRole(role: string): number | null {
  return role === 'admin' || config.userQuotaBytes <= 0 ? null : config.userQuotaBytes;
}
