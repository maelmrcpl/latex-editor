import React, { useMemo, useRef, useState } from 'react';
import {
  BookMarked,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  FileCode2,
  FileImage,
  FilePlus2,
  FileText,
  Folder,
  ListTree,
  Loader2,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
  Upload,
} from 'lucide-react';
import type { CitationResult, ProjectFileEntry } from '@prism-latex/shared';
import { api } from '../lib/api';

interface SidebarExplorerProps {
  projectId: string;
  files: ProjectFileEntry[];
  rootFile: string;
  activePath: string;
  onSelectFile: (path: string, line?: number) => void;
  onCreateFile: (path: string) => Promise<void>;
  onUploadFiles: (fileList: FileList) => Promise<void>;
  onRenamePath: (oldPath: string, newPath: string) => Promise<void>;
  onDeletePath: (path: string) => Promise<void>;
  onSetRootFile: (path: string) => Promise<void>;
  onInsertCitation: (citation: CitationResult) => Promise<void>;
}

interface TreeNode {
  name: string;
  path: string;
  isFolder: boolean;
  file?: ProjectFileEntry;
  children: TreeNode[];
}

function buildFileTree(files: ProjectFileEntry[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const file of files) {
    const parts = file.path.split('/');
    let currentLevel = root;
    let accumPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      accumPath = accumPath ? `${accumPath}/${part}` : part;
      const isLast = i === parts.length - 1;

      let existing = currentLevel.find((n) => n.name === part && n.isFolder === !isLast);
      if (!existing) {
        existing = {
          name: part,
          path: accumPath,
          isFolder: !isLast,
          file: isLast ? file : undefined,
          children: [],
        };
        currentLevel.push(existing);
      }
      currentLevel = existing.children;
    }
  }

  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const n of nodes) {
      if (n.children.length > 0) sortNodes(n.children);
    }
  };
  sortNodes(root);
  return root;
}

interface OutlineItem {
  level: number;
  title: string;
  file: string;
  line: number;
}

function extractOutline(files: ProjectFileEntry[]): OutlineItem[] {
  const items: OutlineItem[] = [];
  const levelMap: Record<string, number> = {
    part: 0,
    chapter: 1,
    section: 2,
    subsection: 3,
    subsubsection: 4,
  };

  for (const f of files) {
    if (!f.path.endsWith('.tex') || !f.content) continue;
    const lines = f.content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(
        /^\s*\\(part|chapter|section|subsection|subsubsection)\*?\{([^}]+)\}/
      );
      if (m) {
        items.push({
          level: levelMap[m[1]] ?? 2,
          title: m[2].trim(),
          file: f.path,
          line: i + 1,
        });
      }
    }
  }
  return items;
}

export const SidebarExplorer: React.FC<SidebarExplorerProps> = ({
  files,
  rootFile,
  activePath,
  onSelectFile,
  onCreateFile,
  onUploadFiles,
  onRenamePath,
  onDeletePath,
  onSetRootFile,
  onInsertCitation,
}) => {
  const [tab, setTab] = useState<'files' | 'outline' | 'citations'>('files');
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  // Citations state
  const [citeQuery, setCiteQuery] = useState('');
  const [citeSource, setCiteSource] = useState<'all' | 'arxiv' | 'crossref'>('all');
  const [citeLoading, setCiteLoading] = useState(false);
  const [citeResults, setCiteResults] = useState<CitationResult[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [insertedId, setInsertedId] = useState<string | null>(null);

  const tree = useMemo(() => buildFileTree(files), [files]);
  const outline = useMemo(() => extractOutline(files), [files]);

  const toggleFolder = (folderPath: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) next.delete(folderPath);
      else next.add(folderPath);
      return next;
    });
  };

  const handlePromptNewFile = async () => {
    const raw = window.prompt(
      'Chemin du nouveau fichier (ex: sections/methodologie.tex ou references.bib) :',
      'sections/nouvelle-section.tex'
    );
    if (!raw || !raw.trim()) return;
    await onCreateFile(raw.trim());
  };

  const handlePromptRename = async (e: React.MouseEvent, currentPath: string) => {
    e.stopPropagation();
    const next = window.prompt('Nouveau chemin / nom :', currentPath);
    if (!next || !next.trim() || next.trim() === currentPath) return;
    await onRenamePath(currentPath, next.trim());
  };

  const handlePromptDelete = async (e: React.MouseEvent, targetPath: string) => {
    e.stopPropagation();
    if (!window.confirm(`Supprimer "${targetPath}" ?`)) return;
    await onDeletePath(targetPath);
  };

  const handleSearchCitations = async (e: React.FormEvent) => {
    e.preventDefault();
    if (citeQuery.trim().length < 2) return;
    setCiteLoading(true);
    try {
      const res = await api.citations.search(citeQuery.trim(), citeSource);
      setCiteResults(res.results);
    } catch {
      setCiteResults([]);
    } finally {
      setCiteLoading(false);
    }
  };

  const renderNode = (node: TreeNode, depth = 0): React.ReactNode => {
    if (node.isFolder) {
      const isCollapsed = collapsedFolders.has(node.path);
      return (
        <div key={node.path}>
          <div
            onClick={() => toggleFolder(node.path)}
            style={{ paddingLeft: `${depth * 12 + 10}px` }}
            className="group h-7 pr-2 flex items-center justify-between text-xs text-zinc-300 hover:bg-zinc-900 rounded-lg cursor-pointer select-none"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              {isCollapsed ? (
                <ChevronRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
              )}
              <Folder className="w-3.5 h-3.5 text-indigo-400/80 shrink-0" />
              <span className="truncate">{node.name}</span>
            </div>
            <div className="hidden group-hover:flex items-center gap-0.5">
              <button
                onClick={(e) => handlePromptRename(e, node.path)}
                title="Renommer le dossier"
                className="p-1 rounded hover:bg-zinc-800 text-zinc-400 cursor-pointer"
              >
                <Pencil className="w-3 h-3" />
              </button>
              <button
                onClick={(e) => handlePromptDelete(e, node.path)}
                title="Supprimer le dossier"
                className="p-1 rounded hover:bg-red-500/20 text-zinc-400 hover:text-red-400 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>

          {!isCollapsed && node.children.map((c) => renderNode(c, depth + 1))}
        </div>
      );
    }

    const isActive = node.path === activePath;
    const isRoot = node.path === rootFile;
    const isImage = /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(node.name);
    const isBib = node.name.endsWith('.bib');

    return (
      <div
        key={node.path}
        onClick={() => onSelectFile(node.path)}
        style={{ paddingLeft: `${depth * 12 + 18}px` }}
        className={`group h-7 pr-2 flex items-center justify-between text-xs rounded-lg cursor-pointer select-none transition ${
          isActive
            ? 'bg-indigo-600/20 text-indigo-200 font-medium'
            : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {isImage ? (
            <FileImage className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          ) : isBib ? (
            <BookMarked className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          ) : node.name.endsWith('.tex') ? (
            <FileCode2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          ) : (
            <FileText className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
          )}
          <span className="truncate">{node.name}</span>
          {isRoot && (
            <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-indigo-500/25 text-indigo-300 font-semibold shrink-0">
              root
            </span>
          )}
        </div>

        <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
          {node.name.endsWith('.tex') && !isRoot && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                void onSetRootFile(node.path);
              }}
              title="Définir comme fichier principal (root)"
              className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-amber-300 cursor-pointer"
            >
              <Star className="w-3 h-3" />
            </button>
          )}
          <button
            onClick={(e) => handlePromptRename(e, node.path)}
            title="Renommer"
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 cursor-pointer"
          >
            <Pencil className="w-3 h-3" />
          </button>
          {files.length > 1 && (
            <button
              onClick={(e) => handlePromptDelete(e, node.path)}
              title="Supprimer"
              className="p-1 rounded hover:bg-red-500/20 text-zinc-400 hover:text-red-400 cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <aside
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files?.length) {
          void onUploadFiles(e.dataTransfer.files);
        }
      }}
      className={`h-full flex flex-col bg-zinc-950 border-r border-zinc-800/90 select-none ${
        dragOver ? 'ring-2 ring-inset ring-indigo-500 bg-indigo-950/20' : ''
      }`}
    >
      {/* Mode switcher */}
      <div className="h-10 px-2 border-b border-zinc-800 flex items-center gap-1 shrink-0">
        <button
          onClick={() => setTab('files')}
          className={`flex-1 py-1.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer ${
            tab === 'files'
              ? 'bg-zinc-800 text-zinc-100'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
          }`}
        >
          <Folder className="w-3.5 h-3.5" />
          Fichiers
        </button>
        <button
          onClick={() => setTab('outline')}
          className={`flex-1 py-1.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer ${
            tab === 'outline'
              ? 'bg-zinc-800 text-zinc-100'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
          }`}
        >
          <ListTree className="w-3.5 h-3.5" />
          Plan
        </button>
        <button
          onClick={() => setTab('citations')}
          className={`flex-1 py-1.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer ${
            tab === 'citations'
              ? 'bg-zinc-800 text-zinc-100'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
          }`}
        >
          <BookMarked className="w-3.5 h-3.5" />
          BibTeX
        </button>
      </div>

      {/* Tab 1: Files */}
      {tab === 'files' && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="px-2.5 py-2 flex items-center justify-between border-b border-zinc-900">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-zinc-500">
              Arborescence
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={handlePromptNewFile}
                title="Nouveau fichier (.tex, .bib, sous-dossier...)"
                className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-300 cursor-pointer"
              >
                <FilePlus2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => uploadInputRef.current?.click()}
                title="Importer des fichiers ou images"
                className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-300 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
              </button>
              <input
                ref={uploadInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) {
                    void onUploadFiles(e.target.files);
                    e.target.value = '';
                  }
                }}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
            {tree.map((node) => renderNode(node, 0))}
          </div>

          <div className="p-2 border-t border-zinc-900 text-[10px] text-zinc-600 text-center">
            Glisser-déposer des images/fichiers ici
          </div>
        </div>
      )}

      {/* Tab 2: Document Outline */}
      {tab === 'outline' && (
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {outline.length === 0 ? (
            <div className="text-xs text-zinc-500 text-center py-8 px-3">
              Aucune section (<code>\section&#123;...&#125;</code>) détectée dans le projet.
            </div>
          ) : (
            outline.map((item, idx) => (
              <button
                key={`${item.file}:${item.line}:${idx}`}
                onClick={() => onSelectFile(item.file, item.line)}
                style={{ paddingLeft: `${Math.max(0, item.level - 1) * 12 + 10}px` }}
                className="w-full text-left py-1.5 pr-2 rounded-lg hover:bg-zinc-900 text-xs text-zinc-300 hover:text-indigo-300 transition cursor-pointer flex flex-col"
              >
                <span className="truncate">{item.title}</span>
                <span className="text-[10px] font-mono text-zinc-600">
                  {item.file}:{item.line}
                </span>
              </button>
            ))
          )}
        </div>
      )}

      {/* Tab 3: Literature Search (arXiv & Crossref) */}
      {tab === 'citations' && (
        <div className="flex-1 flex flex-col min-h-0">
          <form onSubmit={handleSearchCitations} className="p-2.5 border-b border-zinc-900 space-y-2">
            <div className="relative">
              <input
                type="text"
                value={citeQuery}
                onChange={(e) => setCiteQuery(e.target.value)}
                placeholder="Titre, auteur, DOI, arXiv..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
              />
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            </div>

            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-1 text-[11px]">
                {(['all', 'arxiv', 'crossref'] as const).map((src) => (
                  <button
                    type="button"
                    key={src}
                    onClick={() => setCiteSource(src)}
                    className={`px-2 py-0.5 rounded capitalize cursor-pointer ${
                      citeSource === src
                        ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {src === 'all' ? 'Tous' : src}
                  </button>
                ))}
              </div>

              <button
                type="submit"
                disabled={citeLoading}
                className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-[11px] font-medium text-white cursor-pointer"
              >
                {citeLoading ? '...' : 'Chercher'}
              </button>
            </div>
          </form>

          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {citeLoading ? (
              <div className="py-10 flex flex-col items-center gap-2 text-zinc-500 text-xs">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                Interrogation d'arXiv & Crossref...
              </div>
            ) : citeResults.length === 0 ? (
              <div className="py-8 px-3 text-center text-xs text-zinc-500">
                Recherche un article scientifique pour l'ajouter automatiquement à{' '}
                <code>references.bib</code> et insérer <code>\cite&#123;...&#125;</code>.
              </div>
            ) : (
              citeResults.map((item) => (
                <div
                  key={item.id}
                  className="p-2.5 rounded-xl bg-zinc-900/70 border border-zinc-800/90 space-y-1.5 text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-zinc-200 leading-snug">{item.title}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-mono shrink-0 ${
                        item.source === 'arxiv'
                          ? 'bg-rose-500/15 text-rose-300'
                          : 'bg-sky-500/15 text-sky-300'
                      }`}
                    >
                      {item.source}
                    </span>
                  </div>

                  <p className="text-[11px] text-zinc-400 line-clamp-1">
                    {item.authors.slice(0, 3).join(', ')}
                    {item.authors.length > 3 ? ' et al.' : ''}
                    {item.year ? ` (${item.year})` : ''}
                  </p>

                  <div className="pt-1 flex items-center justify-between gap-1">
                    <button
                      onClick={async () => {
                        try {
                          await onInsertCitation(item);
                        } catch {
                          return; // erreur affichée dans le bandeau de l'éditeur
                        }
                        setInsertedId(item.id);
                        setTimeout(() => setInsertedId(null), 1600);
                      }}
                      className="px-2 py-1 rounded-lg bg-indigo-600/25 hover:bg-indigo-600/40 text-indigo-200 text-[11px] font-medium flex items-center gap-1 transition cursor-pointer"
                    >
                      {insertedId === item.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          Ajouté !
                        </>
                      ) : (
                        <>
                          <Plus className="w-3 h-3" />
                          .bib & \cite
                        </>
                      )}
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          void navigator.clipboard.writeText(item.bibtex);
                          setCopiedId(item.id);
                          setTimeout(() => setCopiedId(null), 1400);
                        }}
                        title="Copier l'entrée BibTeX"
                        className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 cursor-pointer"
                      >
                        {copiedId === item.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>

                      {item.url && (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          title="Ouvrir la source"
                          className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </aside>
  );
};
