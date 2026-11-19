import { Hono } from 'hono';
import type { StorageUsage } from '@prism-latex/shared';
import { config } from '../config.js';
import { getQuotaBytesForRole, getUserStorageBytes } from '../db.js';
import { type AppVariables, requireApproved, requireAuth } from '../middleware/auth.js';

export const accountRoutes = new Hono<{ Variables: AppVariables }>();
accountRoutes.use('*', requireAuth, requireApproved);

// Espace occupé par les projets de l'utilisateur connecté, son quota et la taille max d'un fichier
accountRoutes.get('/storage', (c) => {
  const user = c.get('user');
  const usage: StorageUsage = {
    usedBytes: getUserStorageBytes(user.id),
    quotaBytes: getQuotaBytesForRole(user.role),
    maxUploadBytes: config.maxUploadBytes,
  };
  return c.json(usage);
});
