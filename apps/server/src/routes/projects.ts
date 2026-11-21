import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { zipSync } from 'fflate';
import type {
  CompilerEngine,
  ProjectBundleFile,
  ProjectDetail,
  ProjectFileEntry,
  ProjectSummary,
  ProjectTemplateId,
} from '@prism-latex/shared';
import { config } from '../config.js';
import { db, getQuotaBytesForRole, getUserStorageBytes } from '../db.js';
import type { AppVariables } from '../middleware/auth.js';
import { requireApproved, requireAuth } from '../middleware/auth.js';
import {
  deleteProjectPathDisk,
  detectFileMetadata,
  getProjectDir,
  normalizeProjectPath,
  readProjectFileDisk,
  resolveSafeProjectFilePath,
  writeProjectFileDisk,
} from '../storage.js';
import { getTemplateFiles } from '../templates.js';
import { guessCompiler, pickRootFile, readImportArchive } from '../importArchive.js';

const VALID_COMPILERS = new Set<CompilerEngine>(['pdflatex', 'xelatex', 'lualatex']);
const VALID_TEMPLATES = new Set<ProjectTemplateId>(['article', 'report-fr', 'beamer', 'blank']);
/** Types servis inline par /raw (images matricielles, sans script possible). Le reste : attachment. */
const INLINE_RAW_MIME = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const MAX_JSON_BODY_BYTES = 5 * 1024 * 1024; // sauvegarde d'un fichier texte depuis l'éditeur
const MULTIPART_OVERHEAD_BYTES = 1024 * 1024;

/** Échappe les jokers LIKE (% et _) d'un chemin utilisé comme préfixe (avec ESCAPE '!'). */
function escapeLike(value: string): string {
  return value.replace(/[!%_]/g, (ch) => `!${ch}`);
}

function formatMb(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} Mo`;
}

/**
 * Vérifie que l'ajout de `deltaBytes` reste dans le quota du propriétaire du projet.
 * Le quota s'applique au propriétaire (pas à l'admin qui éditerait le projet d'un autre).
 * Retourne un message d'erreur, ou null si OK.
 */
function checkQuota(projectId: string, deltaBytes: number): string | null {
  if (deltaBytes <= 0) return null;
  const owner = db
    .prepare(
      `SELECT u.id, u.role FROM projects p JOIN users u ON u.id = p.owner_id
       WHERE p.id = ? LIMIT 1`
    )
    .get(projectId) as { id: string; role: string } | undefined;
  return owner ? checkUserQuota(owner, deltaBytes) : null;
}

/** Même contrôle, pour un utilisateur donné (nouveau projet importé ou dupliqué). */
function checkUserQuota(user: { id: string; role: string }, deltaBytes: number): string | null {
  const quota = getQuotaBytesForRole(user.role);
  if (deltaBytes <= 0 || quota === null) return null;
  const used = getUserStorageBytes(user.id);
  if (used + deltaBytes > quota) {
    return `Quota de stockage dépassé (${formatMb(used)} utilisés sur ${formatMb(quota)}).`;
  }
  return null;
}

const insertFileStmt = db.prepare(
  `INSERT INTO project_files (id, project_id, path, is_binary, mime_type, size, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);

/** Écrit un fichier sur disque et l'enregistre dans un projet qui ne le contient pas encore. */
function addNewProjectFile(projectId: string, cleanPath: string, data: Buffer | string, now: number): void {
  const size = writeProjectFileDisk(projectId, cleanPath, data);
  const meta = detectFileMetadata(cleanPath, typeof data === 'string' ? undefined : data);
  insertFileStmt.run(randomUUID(), projectId, cleanPath, meta.isBinary ? 1 : 0, meta.mimeType, size, now);
}

/** Supprime un projet à moitié créé (import ou duplication interrompus). */
function discardProject(projectId: string): void {
  db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
  try {
    fs.rmSync(getProjectDir(projectId), { recursive: true, force: true });
  } catch {
    // Rien à nettoyer
  }
}

function existingFileSize(projectId: string, cleanPath: string): number {
  const row = db
    .prepare('SELECT size FROM project_files WHERE project_id = ? AND path = ? LIMIT 1')
    .get(projectId, cleanPath) as { size: number } | undefined;
  return row?.size ?? 0;
}

const jsonBodyLimit = bodyLimit({
  maxSize: MAX_JSON_BODY_BYTES,
  onError: (c) => c.json({ error: `Requête trop volumineuse (max ${formatMb(MAX_JSON_BODY_BYTES)}).` }, 413),
});

const uploadBodyLimit = bodyLimit({
  maxSize: config.maxUploadBytes + MULTIPART_OVERHEAD_BYTES,
  onError: (c) =>
    c.json({ error: `Fichier trop volumineux (max ${formatMb(config.maxUploadBytes)} par fichier).` }, 413),
});

interface DbProjectRow {
  id: string;
  name: string;
  description: string;
  root_file: string;
  compiler: CompilerEngine;
  created_at: number;
  updated_at: number;
  owner_id: string | null;
  pinned: number;
  file_count?: number;
  owner_email?: string | null;
  owner_name?: string | null;
}

interface DbFileRow {
  id: string;
  project_id: string;
  path: string;
  is_binary: number;
  mime_type: string;
  size: number;
  updated_at: number;
}

function mapProjectSummary(row: DbProjectRow): ProjectSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    rootFile: row.root_file,
    compiler: row.compiler,
    fileCount: row.file_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    pinned: Boolean(row.pinned),
    owner: row.owner_id
      ? { id: row.owner_id, email: row.owner_email ?? '', name: row.owner_name ?? '' }
      : null,
  };
}

export const projectRoutes = new Hono<{ Variables: AppVariables }>();
projectRoutes.use('*', requireAuth, requireApproved);

// Import a project from a .zip archive.
// Déclarée avant le contrôle d'accès « /:id », qui prendrait « import » pour un identifiant de projet.
projectRoutes.post('/import', uploadBodyLimit, async (c) => {
  const formData = await c.req.formData().catch(() => null);
  const archive = formData?.get('archive');
  if (!(archive instanceof File)) {
    return c.json({ error: 'Archive .zip manquante.' }, 400);
  }

  let entries: Array<{ path: string; data: Uint8Array }>;
  try {
    entries = readImportArchive(new Uint8Array(await archive.arrayBuffer()));
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }

  const rootFile = pickRootFile(entries);
  if (!rootFile) {
    return c.json({ error: "L'archive ne contient aucun fichier .tex." }, 400);
  }

  const user = c.get('user');
  const quotaError = checkUserQuota(
    user,
    entries.reduce((sum, e) => sum + e.data.byteLength, 0)
  );
  if (quotaError) {
    return c.json({ error: quotaError }, 413);
  }

  const nameRaw = formData?.get('name');
  const name =
    (typeof nameRaw === 'string' && nameRaw.trim()) ||
    archive.name.replace(/\.zip$/i, '').trim() ||
    'Projet importé';
  const projectId = randomUUID();
  const now = Date.now();
  const compiler = guessCompiler(entries);

  db.prepare(
    `INSERT INTO projects (id, name, description, root_file, compiler, owner_id, created_at, updated_at)
     VALUES (?, ?, '', ?, ?, ?, ?, ?)`
  ).run(projectId, name.slice(0, 120), rootFile, compiler, user.id, now, now);

  try {
    for (const entry of entries) {
      addNewProjectFile(projectId, entry.path, Buffer.from(entry.data), now);
    }
  } catch {
    discardProject(projectId);
    return c.json({ error: "Impossible d'enregistrer les fichiers de l'archive." }, 500);
  }

  return c.json(
    {
      project: {
        id: projectId,
        name: name.slice(0, 120),
        description: '',
        rootFile,
        compiler,
        fileCount: entries.length,
        createdAt: now,
        updatedAt: now,
        pinned: false,
        owner: { id: user.id, email: user.email, name: user.name },
      } satisfies ProjectSummary,
    },
    201
  );
});

/**
 * Contrôle d'accès : un utilisateur n'accède qu'à ses propres projets, un admin à tous.
 * On répond 404 (et non 403) pour ne pas révéler l'existence des projets des autres.
 */
const requireProjectAccess: MiddlewareHandler<{ Variables: AppVariables }> = async (c, next) => {
  const projectId = c.req.param('id') ?? '';
  const user = c.get('user');
  const row = db.prepare('SELECT owner_id FROM projects WHERE id = ? LIMIT 1').get(projectId) as
    | { owner_id: string | null }
    | undefined;
  if (!row || (user.role !== 'admin' && row.owner_id !== user.id)) {
    return c.json({ error: 'Projet introuvable.' }, 404);
  }
  return next();
};
projectRoutes.use('/:id', requireProjectAccess);
projectRoutes.use('/:id/*', requireProjectAccess);

// List projects (own projects; admins see everyone's)
projectRoutes.get('/', (c) => {
  const user = c.get('user');
  const isAdmin = user.role === 'admin';
  const rows = db
    .prepare(
      `SELECT p.*, COUNT(f.id) AS file_count, u.email AS owner_email, u.name AS owner_name
       FROM projects p
       LEFT JOIN project_files f ON f.project_id = p.id
       LEFT JOIN users u ON u.id = p.owner_id
       ${isAdmin ? '' : 'WHERE p.owner_id = ?'}
       GROUP BY p.id
       ORDER BY p.updated_at DESC`
    )
    .all(...(isAdmin ? [] : [user.id])) as unknown as DbProjectRow[];

  return c.json({ projects: rows.map(mapProjectSummary) });
});

// Create a new project from template
projectRoutes.post('/', jsonBodyLimit, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : '';
  const description =
    typeof body.description === 'string' ? body.description.trim().slice(0, 500) : '';
  const templateId: ProjectTemplateId = VALID_TEMPLATES.has(body.template)
    ? body.template
    : 'article';
  const compiler: CompilerEngine = VALID_COMPILERS.has(body.compiler)
    ? body.compiler
    : 'pdflatex';

  if (!name) {
    return c.json({ error: 'Le nom du projet est requis.' }, 400);
  }

  const projectId = randomUUID();
  const now = Date.now();
  const tpl = getTemplateFiles(templateId, name);

  const user = c.get('user');
  db.prepare(
    `INSERT INTO projects (id, name, description, root_file, compiler, owner_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(projectId, name, description, tpl.rootFile, compiler, user.id, now, now);

  const entries = Object.entries(tpl.files);
  for (const [relPath, content] of entries) {
    addNewProjectFile(projectId, normalizeProjectPath(relPath), content, now);
  }

  return c.json(
    {
      project: {
        id: projectId,
        name,
        description,
        rootFile: tpl.rootFile,
        compiler,
        fileCount: entries.length,
        createdAt: now,
        updatedAt: now,
        pinned: false,
        owner: { id: user.id, email: user.email, name: user.name },
      } satisfies ProjectSummary,
    },
    201
  );
});

// Duplicate a project (the copy belongs to the current user)
projectRoutes.post('/:id/duplicate', (c) => {
  const sourceId = c.req.param('id');
  const source = db.prepare('SELECT * FROM projects WHERE id = ? LIMIT 1').get(sourceId) as
    | DbProjectRow
    | undefined;
  if (!source) {
    return c.json({ error: 'Projet introuvable.' }, 404);
  }
  const fileRows = db
    .prepare('SELECT path, size FROM project_files WHERE project_id = ? ORDER BY path ASC')
    .all(sourceId) as unknown as Array<{ path: string; size: number }>;

  const user = c.get('user');
  const quotaError = checkUserQuota(
    user,
    fileRows.reduce((sum, f) => sum + f.size, 0)
  );
  if (quotaError) {
    return c.json({ error: quotaError }, 413);
  }

  const projectId = randomUUID();
  const now = Date.now();
  const name = `${source.name} (copie)`.slice(0, 120);
  db.prepare(
    `INSERT INTO projects (id, name, description, root_file, compiler, owner_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(projectId, name, source.description, source.root_file, source.compiler, user.id, now, now);

  let copied = 0;
  try {
    for (const row of fileRows) {
      let buf: Buffer;
      try {
        buf = readProjectFileDisk(sourceId, row.path);
      } catch {
        continue; // fichier absent du disque : on l'ignore, comme l'export .zip
      }
      addNewProjectFile(projectId, row.path, buf, now);
      copied++;
    }
  } catch {
    discardProject(projectId);
    return c.json({ error: 'Impossible de dupliquer le projet.' }, 500);
  }

  return c.json(
    {
      project: mapProjectSummary({
        ...source,
        id: projectId,
        name,
        owner_id: user.id,
        owner_email: user.email,
        owner_name: user.name,
        pinned: 0,
        created_at: now,
        updated_at: now,
        file_count: copied,
      }),
    },
    201
  );
});

// Get full project detail (with text file contents preloaded)
projectRoutes.get('/:id', (c) => {
  const projectId = c.req.param('id');
  const projectRow = db
    .prepare(
      `SELECT p.*, u.email AS owner_email, u.name AS owner_name
       FROM projects p LEFT JOIN users u ON u.id = p.owner_id
       WHERE p.id = ? LIMIT 1`
    )
    .get(projectId) as DbProjectRow | undefined;

  if (!projectRow) {
    return c.json({ error: 'Projet introuvable.' }, 404);
  }

  const fileRows = db
    .prepare('SELECT * FROM project_files WHERE project_id = ? ORDER BY path ASC')
    .all(projectId) as unknown as DbFileRow[];

  const files: ProjectFileEntry[] = fileRows.map((f) => {
    let content: string | undefined;
    if (!f.is_binary && f.size <= 2 * 1024 * 1024) {
      try {
        content = readProjectFileDisk(projectId, f.path).toString('utf8');
      } catch {
        content = '';
      }
    }
    return {
      id: f.id,
      path: f.path,
      isBinary: Boolean(f.is_binary),
      mimeType: f.mime_type,
      size: f.size,
      updatedAt: f.updated_at,
      content,
    };
  });

  const folderRows = db
    .prepare('SELECT path FROM project_folders WHERE project_id = ? ORDER BY path ASC')
    .all(projectId) as unknown as Array<{ path: string }>;

  const detail: ProjectDetail = {
    ...mapProjectSummary({ ...projectRow, file_count: files.length }),
    files,
    folders: folderRows.map((r) => r.path),
  };

  return c.json({ project: detail });
});

// Get full project bundle ready for client-side WASM compilation (text + base64 binaries)
projectRoutes.get('/:id/bundle', (c) => {
  const projectId = c.req.param('id');
  const projectRow = db
    .prepare('SELECT id, root_file, compiler FROM projects WHERE id = ? LIMIT 1')
    .get(projectId) as { id: string; root_file: string; compiler: CompilerEngine } | undefined;

  if (!projectRow) {
    return c.json({ error: 'Projet introuvable.' }, 404);
  }

  const fileRows = db
    .prepare('SELECT path, is_binary FROM project_files WHERE project_id = ? ORDER BY path ASC')
    .all(projectId) as unknown as Array<{ path: string; is_binary: number }>;

  const files: ProjectBundleFile[] = [];
  for (const row of fileRows) {
    try {
      const buf = readProjectFileDisk(projectId, row.path);
      const isBinary = Boolean(row.is_binary);
      files.push({
        path: row.path,
        isBinary,
        data: isBinary ? buf.toString('base64') : buf.toString('utf8'),
      });
    } catch {
      // Skip missing files gracefully
    }
  }

  return c.json({
    rootFile: projectRow.root_file,
    compiler: projectRow.compiler,
    files,
  });
});

// Update project metadata (name, description, rootFile, compiler)
projectRoutes.patch('/:id', jsonBodyLimit, async (c) => {
  const projectId = c.req.param('id');
  const existing = db
    .prepare(
      `SELECT p.*, u.email AS owner_email, u.name AS owner_name,
              (SELECT COUNT(*) FROM project_files f WHERE f.project_id = p.id) AS file_count
       FROM projects p LEFT JOIN users u ON u.id = p.owner_id
       WHERE p.id = ? LIMIT 1`
    )
    .get(projectId) as DbProjectRow | undefined;

  if (!existing) {
    return c.json({ error: 'Projet introuvable.' }, 404);
  }

  const body = await c.req.json().catch(() => ({}));
  const name =
    typeof body.name === 'string' && body.name.trim()
      ? body.name.trim().slice(0, 120)
      : existing.name;
  const description =
    typeof body.description === 'string'
      ? body.description.trim().slice(0, 500)
      : existing.description;
  const rootFile =
    typeof body.rootFile === 'string' && body.rootFile.trim()
      ? normalizeProjectPath(body.rootFile)
      : existing.root_file;
  const compiler: CompilerEngine = VALID_COMPILERS.has(body.compiler)
    ? body.compiler
    : existing.compiler;
  const pinned = typeof body.pinned === 'boolean' ? Number(body.pinned) : existing.pinned;

  // Épingler ne compte pas comme une modification : le projet garde sa place de « dernière session »
  const contentChanged =
    typeof body === 'object' &&
    body !== null &&
    ['name', 'description', 'rootFile', 'compiler'].some((k) => k in body);
  const updatedAt = contentChanged ? Date.now() : existing.updated_at;
  db.prepare(
    `UPDATE projects
     SET name = ?, description = ?, root_file = ?, compiler = ?, pinned = ?, updated_at = ?
     WHERE id = ?`
  ).run(name, description, rootFile, compiler, pinned, updatedAt, projectId);

  return c.json({
    project: mapProjectSummary({
      ...existing,
      name,
      description,
      root_file: rootFile,
      compiler,
      pinned,
      updated_at: updatedAt,
    }),
  });
});

// Delete project
projectRoutes.delete('/:id', (c) => {
  const projectId = c.req.param('id');
  db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
  try {
    const dir = getProjectDir(projectId);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch {
    // Ignore fs cleanup errors
  }
  return c.json({ ok: true });
});

// Create or update a text file
projectRoutes.put('/:id/files', jsonBodyLimit, async (c) => {
  const projectId = c.req.param('id');
  const projectExists = db.prepare('SELECT id FROM projects WHERE id = ? LIMIT 1').get(projectId);
  if (!projectExists) {
    return c.json({ error: 'Projet introuvable.' }, 404);
  }

  const body = await c.req.json().catch(() => ({}));
  let cleanPath: string;
  try {
    cleanPath = normalizeProjectPath(body.path);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }

  const content = typeof body.content === 'string' ? body.content : '';
  const quotaError = checkQuota(
    projectId,
    Buffer.byteLength(content, 'utf8') - existingFileSize(projectId, cleanPath)
  );
  if (quotaError) {
    return c.json({ error: quotaError }, 413);
  }
  const size = writeProjectFileDisk(projectId, cleanPath, content);
  const meta = detectFileMetadata(cleanPath);
  const now = Date.now();

  const existingFile = db
    .prepare('SELECT id FROM project_files WHERE project_id = ? AND path = ? LIMIT 1')
    .get(projectId, cleanPath) as { id: string } | undefined;

  const fileId = existingFile?.id ?? randomUUID();

  if (existingFile) {
    db.prepare(
      `UPDATE project_files
       SET is_binary = 0, mime_type = ?, size = ?, updated_at = ?
       WHERE id = ?`
    ).run(meta.mimeType, size, now, fileId);
  } else {
    db.prepare(
      `INSERT INTO project_files (id, project_id, path, is_binary, mime_type, size, updated_at)
       VALUES (?, ?, ?, 0, ?, ?, ?)`
    ).run(fileId, projectId, cleanPath, meta.mimeType, size, now);
  }

  db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now, projectId);

  const fileEntry: ProjectFileEntry = {
    id: fileId,
    path: cleanPath,
    isBinary: false,
    mimeType: meta.mimeType,
    size,
    updatedAt: now,
    content,
  };

  return c.json({ file: fileEntry });
});

// Upload binary or text files (images, PDFs, .bib, .sty, etc.)
projectRoutes.post('/:id/upload', uploadBodyLimit, async (c) => {
  const projectId = c.req.param('id');
  const projectExists = db.prepare('SELECT id FROM projects WHERE id = ? LIMIT 1').get(projectId);
  if (!projectExists) {
    return c.json({ error: 'Projet introuvable.' }, 404);
  }

  const formData = await c.req.formData();
  const folderRaw = formData.get('folder');
  let folderPrefix = '';
  try {
    if (typeof folderRaw === 'string' && folderRaw.trim()) {
      folderPrefix = `${normalizeProjectPath(folderRaw)}/`;
    }
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }

  const uploaded: ProjectFileEntry[] = [];
  const items = formData.getAll('files');
  const now = Date.now();

  for (const item of items) {
    if (!(item instanceof File)) continue;
    if (item.size > config.maxUploadBytes) {
      return c.json(
        {
          error: `Le fichier "${item.name}" dépasse la limite de ${formatMb(config.maxUploadBytes)}.`,
        },
        413
      );
    }

    let cleanPath: string;
    try {
      cleanPath = normalizeProjectPath(`${folderPrefix}${item.name}`);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }

    const quotaError = checkQuota(projectId, item.size - existingFileSize(projectId, cleanPath));
    if (quotaError) {
      return c.json({ error: quotaError }, 413);
    }

    const buf = Buffer.from(await item.arrayBuffer());
    const meta = detectFileMetadata(cleanPath, buf);
    const size = writeProjectFileDisk(projectId, cleanPath, buf);

    const existingFile = db
      .prepare('SELECT id FROM project_files WHERE project_id = ? AND path = ? LIMIT 1')
      .get(projectId, cleanPath) as { id: string } | undefined;

    const fileId = existingFile?.id ?? randomUUID();

    if (existingFile) {
      db.prepare(
        `UPDATE project_files
         SET is_binary = ?, mime_type = ?, size = ?, updated_at = ?
         WHERE id = ?`
      ).run(meta.isBinary ? 1 : 0, meta.mimeType, size, now, fileId);
    } else {
      db.prepare(
        `INSERT INTO project_files (id, project_id, path, is_binary, mime_type, size, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(fileId, projectId, cleanPath, meta.isBinary ? 1 : 0, meta.mimeType, size, now);
    }

    uploaded.push({
      id: fileId,
      path: cleanPath,
      isBinary: meta.isBinary,
      mimeType: meta.mimeType,
      size,
      updatedAt: now,
      content: !meta.isBinary ? buf.toString('utf8') : undefined,
    });
  }

  db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now, projectId);
  return c.json({ files: uploaded });
});

// Create an (empty) folder
projectRoutes.post('/:id/folders', jsonBodyLimit, async (c) => {
  const projectId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  let cleanPath: string;
  try {
    cleanPath = normalizeProjectPath(body?.path);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }

  const taken = db
    .prepare(
      `SELECT 1 FROM project_files WHERE project_id = ? AND (path = ? OR path LIKE ? ESCAPE '!')
       UNION ALL
       SELECT 1 FROM project_folders WHERE project_id = ? AND path = ?
       LIMIT 1`
    )
    .get(projectId, cleanPath, `${escapeLike(cleanPath)}/%`, projectId, cleanPath);
  if (taken) {
    return c.json({ error: 'Un fichier ou dossier porte déjà ce nom.' }, 409);
  }
  // Un fichier ne peut pas servir de dossier parent
  const segments = cleanPath.split('/');
  for (let i = 1; i < segments.length; i++) {
    const parent = segments.slice(0, i).join('/');
    if (db.prepare('SELECT 1 FROM project_files WHERE project_id = ? AND path = ?').get(projectId, parent)) {
      return c.json({ error: `« ${parent} » est un fichier, pas un dossier.` }, 409);
    }
  }

  fs.mkdirSync(resolveSafeProjectFilePath(projectId, cleanPath), { recursive: true });
  const now = Date.now();
  db.prepare('INSERT INTO project_folders (project_id, path, created_at) VALUES (?, ?, ?)').run(
    projectId,
    cleanPath,
    now
  );
  db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now, projectId);
  return c.json({ path: cleanPath }, 201);
});

// Rename a file or folder
projectRoutes.post('/:id/rename', jsonBodyLimit, async (c) => {
  const projectId = c.req.param('id');
  const projectRow = db
    .prepare('SELECT id, root_file FROM projects WHERE id = ? LIMIT 1')
    .get(projectId) as { id: string; root_file: string } | undefined;

  if (!projectRow) {
    return c.json({ error: 'Projet introuvable.' }, 404);
  }

  const body = await c.req.json().catch(() => ({}));
  let oldPath: string;
  let newPath: string;
  try {
    oldPath = normalizeProjectPath(body.oldPath);
    newPath = normalizeProjectPath(body.newPath);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }

  if (oldPath === newPath) {
    return c.json({ ok: true, rootFile: projectRow.root_file });
  }

  const oldAbs = resolveSafeProjectFilePath(projectId, oldPath);
  const newAbs = resolveSafeProjectFilePath(projectId, newPath);

  if (!fs.existsSync(oldAbs)) {
    return c.json({ error: 'Fichier ou dossier source introuvable.' }, 404);
  }
  if (fs.existsSync(newAbs)) {
    return c.json({ error: 'Un fichier ou dossier porte déjà ce nom.' }, 409);
  }

  fs.mkdirSync(path.dirname(newAbs), { recursive: true });
  fs.renameSync(oldAbs, newAbs);

  const now = Date.now();
  const affectedRows = db
    .prepare(
      `SELECT id, path FROM project_files
       WHERE project_id = ? AND (path = ? OR path LIKE ? ESCAPE '!')`
    )
    .all(projectId, oldPath, `${escapeLike(oldPath)}/%`) as unknown as Array<{ id: string; path: string }>;

  const updateStmt = db.prepare('UPDATE project_files SET path = ?, updated_at = ? WHERE id = ?');
  for (const row of affectedRows) {
    const updatedRel =
      row.path === oldPath ? newPath : `${newPath}${row.path.slice(oldPath.length)}`;
    updateStmt.run(updatedRel, now, row.id);
  }

  const affectedFolders = db
    .prepare(
      `SELECT path FROM project_folders
       WHERE project_id = ? AND (path = ? OR path LIKE ? ESCAPE '!')`
    )
    .all(projectId, oldPath, `${escapeLike(oldPath)}/%`) as unknown as Array<{ path: string }>;
  const updateFolderStmt = db.prepare(
    'UPDATE project_folders SET path = ? WHERE project_id = ? AND path = ?'
  );
  for (const row of affectedFolders) {
    updateFolderStmt.run(`${newPath}${row.path.slice(oldPath.length)}`, projectId, row.path);
  }

  let updatedRoot = projectRow.root_file;
  if (updatedRoot === oldPath) {
    updatedRoot = newPath;
  } else if (updatedRoot.startsWith(`${oldPath}/`)) {
    updatedRoot = `${newPath}${updatedRoot.slice(oldPath.length)}`;
  }

  db.prepare('UPDATE projects SET root_file = ?, updated_at = ? WHERE id = ?').run(
    updatedRoot,
    now,
    projectId
  );

  return c.json({ ok: true, rootFile: updatedRoot });
});

// Delete a file or folder
projectRoutes.delete('/:id/files', (c) => {
  const projectId = c.req.param('id');
  const rawPath = c.req.query('path') ?? '';
  let cleanPath: string;
  try {
    cleanPath = normalizeProjectPath(rawPath);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }

  deleteProjectPathDisk(projectId, cleanPath);
  db.prepare(
    `DELETE FROM project_files
     WHERE project_id = ? AND (path = ? OR path LIKE ? ESCAPE '!')`
  ).run(projectId, cleanPath, `${escapeLike(cleanPath)}/%`);
  db.prepare(
    `DELETE FROM project_folders
     WHERE project_id = ? AND (path = ? OR path LIKE ? ESCAPE '!')`
  ).run(projectId, cleanPath, `${escapeLike(cleanPath)}/%`);

  db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(Date.now(), projectId);
  return c.json({ ok: true });
});

// Serve raw file (image preview, PDF asset, etc.)
projectRoutes.get('/:id/raw/*', (c) => {
  const projectId = c.req.param('id');
  const prefix = `/api/projects/${projectId}/raw/`;
  let cleanPath: string;
  try {
    const reqPath = decodeURIComponent(new URL(c.req.url).pathname);
    const relRaw = reqPath.startsWith(prefix) ? reqPath.slice(prefix.length) : '';
    cleanPath = normalizeProjectPath(relRaw);
  } catch {
    return c.json({ error: 'Chemin invalide.' }, 400);
  }

  const fileRow = db
    .prepare('SELECT mime_type FROM project_files WHERE project_id = ? AND path = ? LIMIT 1')
    .get(projectId, cleanPath) as { mime_type: string } | undefined;

  if (!fileRow) {
    return c.json({ error: 'Fichier introuvable.' }, 404);
  }

  try {
    const buf = readProjectFileDisk(projectId, cleanPath);
    // Fichiers déposés par les utilisateurs : jamais exécutés dans l'origine de l'app.
    // Un SVG/HTML ouvert directement (lien envoyé à un admin) ne peut lancer aucun script,
    // et seules les images matricielles sont affichées inline.
    const headers: Record<string, string> = {
      'Content-Type': fileRow.mime_type,
      'Cache-Control': 'no-cache',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    };
    if (!INLINE_RAW_MIME.has(fileRow.mime_type)) {
      const asciiName = path.posix.basename(cleanPath).replace(/[^\w.-]+/g, '_') || 'fichier';
      headers['Content-Disposition'] = `attachment; filename="${asciiName}"`;
    }
    return new Response(new Uint8Array(buf), { headers });
  } catch {
    return c.json({ error: 'Impossible de lire le fichier.' }, 404);
  }
});

// Export project as .zip archive
projectRoutes.get('/:id/export.zip', (c) => {
  const projectId = c.req.param('id');
  const projectRow = db
    .prepare('SELECT name FROM projects WHERE id = ? LIMIT 1')
    .get(projectId) as { name: string } | undefined;

  if (!projectRow) {
    return c.json({ error: 'Projet introuvable.' }, 404);
  }

  const fileRows = db
    .prepare('SELECT path FROM project_files WHERE project_id = ? ORDER BY path ASC')
    .all(projectId) as unknown as Array<{ path: string }>;

  const zipInput: Record<string, Uint8Array> = {};
  // Dossiers vides : entrée « dossier/ » pour qu'ils existent à la décompression
  const folderRows = db
    .prepare('SELECT path FROM project_folders WHERE project_id = ?')
    .all(projectId) as unknown as Array<{ path: string }>;
  for (const row of folderRows) {
    if (!fileRows.some((f) => f.path.startsWith(`${row.path}/`))) {
      zipInput[`${row.path}/`] = new Uint8Array(0);
    }
  }
  for (const row of fileRows) {
    try {
      const buf = readProjectFileDisk(projectId, row.path);
      zipInput[row.path] = new Uint8Array(buf);
    } catch {
      // Skip unreadable file
    }
  }

  const zipped = zipSync(zipInput, { level: 6 });
  const safeFilename =
    projectRow.name
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'latex-project';

  return new Response(Buffer.from(zipped), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${safeFilename}.zip"`,
    },
  });
});
