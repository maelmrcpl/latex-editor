import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const TEXT_EXTENSIONS = new Set([
  '.tex',
  '.bib',
  '.bst',
  '.sty',
  '.cls',
  '.def',
  '.cfg',
  '.bbx',
  '.cbx',
  '.lbx',
  '.txt',
  '.md',
  '.csv',
  '.tsv',
  '.tikz',
  '.pgf',
  '.svg',
  '.json',
  '.yml',
  '.yaml',
]);

const MIME_BY_EXT: Record<string, string> = {
  '.tex': 'text/x-tex',
  '.bib': 'text/x-bibtex',
  '.sty': 'text/x-tex',
  '.cls': 'text/x-tex',
  '.bst': 'text/plain',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.csv': 'text/csv',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.eps': 'application/postscript',
};

/**
 * Sanitizes and validates a relative path inside a project, blocking path traversal.
 */
export function normalizeProjectPath(rawPath: string): string {
  if (!rawPath || typeof rawPath !== 'string') {
    throw new Error('Chemin de fichier invalide.');
  }
  if (rawPath.includes('\0')) {
    throw new Error('Caractère nul interdit dans le chemin.');
  }
  const normalized = rawPath
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '');

  if (!normalized || normalized.length > 260) {
    throw new Error('Chemin de fichier vide ou trop long.');
  }

  const segments = normalized.split('/');
  for (const seg of segments) {
    if (!seg || seg === '.' || seg === '..') {
      throw new Error('Traversée de répertoire interdite.');
    }
    if (/[\x00-\x1f<>:"|?*]/.test(seg)) {
      throw new Error(`Caractères invalides dans le nom "${seg}".`);
    }
  }

  return segments.join('/');
}

export function resolveSafeProjectFilePath(projectId: string, relPath: string): string {
  const safeProjectId = projectId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeProjectId || safeProjectId !== projectId) {
    throw new Error('Identifiant de projet invalide.');
  }
  const cleanRel = normalizeProjectPath(relPath);
  const projectRoot = path.resolve(config.projectsDir, safeProjectId);
  const resolved = path.resolve(projectRoot, cleanRel);

  const relativeCheck = path.relative(projectRoot, resolved);
  if (relativeCheck.startsWith('..') || path.isAbsolute(relativeCheck)) {
    throw new Error('Accès hors du dossier projet refusé.');
  }
  return resolved;
}

export function getProjectDir(projectId: string): string {
  const safeProjectId = projectId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeProjectId || safeProjectId !== projectId) {
    throw new Error('Identifiant de projet invalide.');
  }
  return path.resolve(config.projectsDir, safeProjectId);
}

export function detectFileMetadata(filePath: string, buffer?: Buffer): { isBinary: boolean; mimeType: string } {
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = MIME_BY_EXT[ext] ?? 'application/octet-stream';

  if (TEXT_EXTENSIONS.has(ext)) {
    return { isBinary: false, mimeType };
  }
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.eps', '.otf', '.ttf', '.woff', '.woff2'].includes(ext)) {
    return { isBinary: true, mimeType };
  }

  if (buffer) {
    const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
    const hasNullByte = sample.includes(0);
    return {
      isBinary: hasNullByte,
      mimeType: hasNullByte ? 'application/octet-stream' : 'text/plain',
    };
  }

  return { isBinary: false, mimeType: 'text/plain' };
}

export function writeProjectFileDisk(projectId: string, relPath: string, data: Buffer | string): number {
  const absPath = resolveSafeProjectFilePath(projectId, relPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  if (typeof data === 'string') {
    const buf = Buffer.from(data, 'utf8');
    fs.writeFileSync(absPath, buf);
    return buf.byteLength;
  } else {
    fs.writeFileSync(absPath, data);
    return data.byteLength;
  }
}

export function readProjectFileDisk(projectId: string, relPath: string): Buffer {
  const absPath = resolveSafeProjectFilePath(projectId, relPath);
  return fs.readFileSync(absPath);
}

export function deleteProjectPathDisk(projectId: string, relPath: string): void {
  const absPath = resolveSafeProjectFilePath(projectId, relPath);
  if (fs.existsSync(absPath)) {
    fs.rmSync(absPath, { recursive: true, force: true });
  }
}
