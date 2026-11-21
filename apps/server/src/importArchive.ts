import { unzipSync } from 'fflate';
import type { CompilerEngine } from '@prism-latex/shared';
import { config } from './config.js';
import { normalizeProjectPath } from './storage.js';

/** Garde-fous contre les archives géantes ou piégées (zip bomb). */
const MAX_IMPORT_FILES = 2000;
const MAX_IMPORT_TOTAL_BYTES = 300 * 1024 * 1024;

/** Fichiers système et produits de compilation : inutiles dans un projet SynTeX. */
const IGNORED_NAMES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);
const IGNORED_EXTENSIONS = /\.(aux|log|out|toc|lof|lot|fls|fdb_latexmk|synctex\.gz|synctex|blg|run\.xml|bcf)$/i;

export interface ImportedEntry {
  path: string;
  data: Uint8Array;
}

export interface ImportedArchive {
  files: ImportedEntry[];
  /** Dossiers vides de l'archive (sans fichier ni sous-dossier conservé). */
  folders: string[];
}

function isIgnored(path: string): boolean {
  const segments = path.split('/');
  const base = segments[segments.length - 1];
  return (
    segments.includes('__MACOSX') ||
    segments.some((s) => s === '.git') ||
    IGNORED_NAMES.has(base) ||
    IGNORED_EXTENSIONS.test(base)
  );
}

/**
 * Décompresse une archive .zip en fichiers de projet aux chemins validés, en gardant ses dossiers vides.
 * Si tout le contenu est rangé dans un unique dossier (zip d'un dossier), ce dossier est retiré.
 */
export function readImportArchive(zip: Uint8Array): ImportedArchive {
  let fileCount = 0;
  let declaredTotal = 0;
  const dirNames: string[] = [];
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(zip, {
      filter: (file) => {
        const name = file.name.replace(/\\/g, '/');
        if (name.endsWith('/')) {
          // Entrée de dossier : rien à décompresser, on la garde de côté
          const dir = name.replace(/\/+$/, '');
          if (dir && !isIgnored(dir) && dirNames.length < MAX_IMPORT_FILES) dirNames.push(dir);
          return false;
        }
        if (isIgnored(name)) return false;
        fileCount++;
        declaredTotal += file.originalSize;
        if (fileCount > MAX_IMPORT_FILES) {
          throw new Error(`L'archive contient trop de fichiers (max ${MAX_IMPORT_FILES}).`);
        }
        if (file.originalSize > config.maxUploadBytes) {
          throw new Error(
            `Le fichier "${file.name}" dépasse la limite de ${Math.round(config.maxUploadBytes / (1024 * 1024))} Mo.`
          );
        }
        if (declaredTotal > MAX_IMPORT_TOTAL_BYTES) {
          throw new Error("L'archive est trop volumineuse une fois décompressée.");
        }
        return true;
      },
    });
  } catch (err) {
    const message = (err as Error).message;
    throw new Error(message.startsWith("L'archive") || message.startsWith('Le fichier') ? message : 'Archive .zip illisible ou corrompue.');
  }

  const raw = Object.entries(unzipped).map(([name, data]) => ({ name: name.replace(/\\/g, '/'), data }));
  if (raw.length === 0) {
    throw new Error("L'archive est vide.");
  }

  // Dossier racine commun ? Les dossiers comptent aussi : un « autre/ » vide à côté empêche le retrait.
  const firstSegments = new Set(
    [...raw.map((e) => e.name), ...dirNames.map((d) => `${d}/`)].map((n) =>
      n.includes('/') ? n.split('/')[0] : ''
    )
  );
  const [onlySegment] = [...firstSegments];
  const stripPrefix = firstSegments.size === 1 && onlySegment && onlySegment !== '..' && onlySegment !== '.' ? `${onlySegment}/` : '';

  const seen = new Set<string>();
  const entries: ImportedEntry[] = [];
  let total = 0;
  for (const { name, data } of raw) {
    const path = normalizeProjectPath(name.slice(stripPrefix.length));
    if (seen.has(path)) continue;
    seen.add(path);
    if (data.byteLength > config.maxUploadBytes) {
      throw new Error(`Le fichier "${path}" dépasse la limite autorisée.`);
    }
    total += data.byteLength;
    if (total > MAX_IMPORT_TOTAL_BYTES) {
      throw new Error("L'archive est trop volumineuse une fois décompressée.");
    }
    entries.push({ path, data });
  }

  // Dossiers vides : sans fichier ni autre dossier conservé à l'intérieur
  const dirs = new Set<string>();
  for (const name of dirNames) {
    if (!name.startsWith(stripPrefix)) continue;
    const rel = name.slice(stripPrefix.length);
    if (!rel) continue; // le dossier racine retiré lui-même
    try {
      dirs.add(normalizeProjectPath(rel));
    } catch {
      // Chemin de dossier invalide : ignoré
    }
  }
  const occupied = [...seen, ...dirs];
  const parentIsFile = (dir: string) => {
    const segments = dir.split('/');
    return segments.some((_, i) => i > 0 && seen.has(segments.slice(0, i).join('/')));
  };
  const folders = [...dirs]
    .filter(
      (dir) => !seen.has(dir) && !parentIsFile(dir) && !occupied.some((p) => p.startsWith(`${dir}/`))
    )
    .sort();

  return { files: entries, folders };
}

const decoder = new TextDecoder('utf-8', { fatal: false });

function texSource(entry: ImportedEntry): string {
  // Commentaires retirés pour ne pas être trompé par un \documentclass désactivé
  return decoder.decode(entry.data).replace(/(?<!\\)%.*$/gm, '');
}

/** Fichier principal : un .tex avec \documentclass, en préférant main.tex puis le moins profond. */
export function pickRootFile(entries: ImportedEntry[]): string | null {
  const texFiles = entries.filter((e) => e.path.toLowerCase().endsWith('.tex'));
  if (texFiles.length === 0) return null;
  const withClass = texFiles.filter((e) => /\\documentclass\s*[[{]/.test(texSource(e)));
  const candidates = withClass.length > 0 ? withClass : texFiles;
  const depth = (p: string) => p.split('/').length;
  const score = (p: string) => {
    const base = p.split('/').pop()!.toLowerCase();
    return base === 'main.tex' ? 0 : base === 'document.tex' || base === 'paper.tex' ? 1 : 2;
  };
  candidates.sort(
    (a, b) => depth(a.path) - depth(b.path) || score(a.path) - score(b.path) || a.path.localeCompare(b.path)
  );
  return candidates[0].path;
}

/** Moteur probable d'après les paquets utilisés (fontspec/polyglossia → XeLaTeX, Lua → LuaLaTeX). */
export function guessCompiler(entries: ImportedEntry[]): CompilerEngine {
  let engine: CompilerEngine = 'pdflatex';
  for (const entry of entries) {
    if (!entry.path.toLowerCase().endsWith('.tex')) continue;
    const src = texSource(entry);
    if (/\\usepackage(\[[^\]]*\])?\{[^}]*\b(luacode|luatextra|luaotfload)\b/.test(src) || /\\directlua\b/.test(src)) {
      return 'lualatex';
    }
    if (/\\usepackage(\[[^\]]*\])?\{[^}]*\b(fontspec|polyglossia|unicode-math|xeCJK)\b/.test(src)) {
      engine = 'xelatex';
    }
  }
  return engine;
}
