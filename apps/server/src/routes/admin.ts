import { Hono } from 'hono';
import type { AdminUserEntry, UserStatus } from '@prism-latex/shared';
import { db, getQuotaBytesForRole } from '../db.js';
import {
  type AppVariables,
  type DbUserRow,
  mapAuthUser,
  requireAdmin,
  requireAuth,
} from '../middleware/auth.js';

const VALID_STATUSES = new Set<UserStatus>(['pending', 'approved', 'rejected']);

type AdminUserRow = DbUserRow & { project_count: number; storage_bytes: number };

/** Colonnes calculées : nombre de projets et espace occupé par utilisateur */
const USER_STATS_COLUMNS = `
  (SELECT COUNT(*) FROM projects p WHERE p.owner_id = u.id) AS project_count,
  (SELECT COALESCE(SUM(f.size), 0)
     FROM project_files f JOIN projects p ON p.id = f.project_id
     WHERE p.owner_id = u.id) AS storage_bytes`;

function mapAdminUser(row: AdminUserRow): AdminUserEntry {
  return {
    ...mapAuthUser(row),
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
    reviewedAt: row.reviewed_at,
    projectCount: Number(row.project_count) || 0,
    storageBytes: Number(row.storage_bytes) || 0,
    quotaBytes: getQuotaBytesForRole(row.role),
  };
}

export const adminRoutes = new Hono<{ Variables: AppVariables }>();
adminRoutes.use('*', requireAuth, requireAdmin);

// Liste des comptes : demandes en attente d'abord, puis par date d'inscription
adminRoutes.get('/users', (c) => {
  const rows = db
    .prepare(
      `SELECT u.*, ${USER_STATS_COLUMNS}
       FROM users u
       ORDER BY CASE u.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
                u.created_at DESC`
    )
    .all() as unknown as AdminUserRow[];

  return c.json({ users: rows.map(mapAdminUser) });
});

// Valider / refuser / remettre en attente un compte
adminRoutes.patch('/users/:id', async (c) => {
  const targetId = c.req.param('id');
  const admin = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const status = body?.status as UserStatus;

  if (!VALID_STATUSES.has(status)) {
    return c.json({ error: 'Statut invalide.' }, 400);
  }

  const target = db.prepare('SELECT * FROM users WHERE id = ? LIMIT 1').get(targetId) as
    | DbUserRow
    | undefined;
  if (!target) {
    return c.json({ error: 'Utilisateur introuvable.' }, 404);
  }
  if (target.role === 'admin') {
    return c.json(
      { error: 'Les administrateurs sont gérés via ADMIN_EMAILS dans le fichier .env.' },
      400
    );
  }

  const now = Date.now();
  db.prepare(
    'UPDATE users SET status = ?, reviewed_at = ?, reviewed_by = ?, updated_at = ? WHERE id = ?'
  ).run(status, now, admin.id, now, targetId);

  const updated = db
    .prepare(
      `SELECT u.*, ${USER_STATS_COLUMNS}
       FROM users u WHERE u.id = ? LIMIT 1`
    )
    .get(targetId) as unknown as AdminUserRow;

  console.log(`[admin] ${admin.email} : ${target.email} -> ${status}`);
  return c.json({ user: mapAdminUser(updated) });
});
