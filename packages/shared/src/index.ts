export type CompilerEngine = 'pdflatex' | 'xelatex' | 'lualatex';

export type ProjectTemplateId = 'article' | 'report-fr' | 'beamer' | 'blank';

export type UserRole = 'user' | 'admin';

export type UserStatus = 'pending' | 'approved' | 'rejected';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: UserRole;
  status: UserStatus;
}

export interface AdminUserEntry extends AuthUser {
  createdAt: number;
  lastLoginAt: number | null;
  reviewedAt: number | null;
  projectCount: number;
}

export interface ProjectOwner {
  id: string;
  email: string;
  name: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  rootFile: string;
  compiler: CompilerEngine;
  fileCount: number;
  createdAt: number;
  updatedAt: number;
  /** Propriétaire du projet (renseigné pour les admins, qui voient tous les projets) */
  owner?: ProjectOwner | null;
}

export interface ProjectFileEntry {
  id: string;
  path: string;
  isBinary: boolean;
  mimeType: string;
  size: number;
  updatedAt: number;
  /** Present for text files when loading a project */
  content?: string;
}

export interface ProjectDetail extends ProjectSummary {
  files: ProjectFileEntry[];
}

export interface ProjectBundleFile {
  path: string;
  isBinary: boolean;
  /** UTF-8 string for text files, base64 string for binary files */
  data: string;
}

export interface DiagnosticItem {
  severity: 'error' | 'warning' | 'info';
  file: string;
  line: number | null;
  message: string;
  raw?: string;
}

export interface CitationResult {
  id: string;
  source: 'arxiv' | 'crossref';
  title: string;
  authors: string[];
  year: number | null;
  venue?: string;
  doi?: string;
  url?: string;
  abstract?: string;
  citeKey: string;
  bibtex: string;
}

export interface SyncTeXForwardResult {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SyncTeXInverseResult {
  file: string;
  line: number;
  column?: number;
}
