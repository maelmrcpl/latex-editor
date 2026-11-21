import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  CaseSensitive,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  FilePlus2,
  FolderPlus,
  Pencil,
  Search,
  Star,
  Trash2,
  Upload,
} from 'lucide-react';
import type { CitationResult, ProjectFileEntry } from '@prism-latex/shared';
import { api } from '../lib/api';
import { useDialogs } from './ui/Dialog';
import { cx, IconButton, inputClass, Spinner, Tabs } from './ui';

interface SidebarExplorerProps {
  projectId: string;
  files: ProjectFileEntry[];
  /** Dossiers créés explicitement (éventuellement vides) */
  folders: string[];
  rootFile: string;
  activePath: string;
  /** Change à chaque demande d'ouverture de la recherche (Ctrl+Shift+F) */
  searchRequest?: number;
  onSelectFile: (path: string, line?: number, column?: number, length?: number) => void;
  onCreateFile: (path: string) => Promise<void>;
  onCreateFolder: (path: string) => Promise<void>;
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

function buildFileTree(files: ProjectFileEntry[], folders: string[]): TreeNode[] {
  const root: TreeNode[] = [];

  const entries: Array<{ path: string; file?: ProjectFileEntry }> = [
    ...folders.map((path) => ({ path })),
    ...files.map((file) => ({ path: file.path, file })),
  ];
  for (const { path, file } of entries) {
    const parts = path.split('/');
    let currentLevel = root;
    let accumPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      accumPath = accumPath ? `${accumPath}/${part}` : part;
      const isLast = i === parts.length - 1;
      const isFolder = !isLast || !file;

      let existing = currentLevel.find((n) => n.name === part && n.isFolder === isFolder);
      if (!existing) {
        existing = {
          name: part,
          path: accumPath,
          isFolder,
          file: isFolder ? undefined : file,
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

interface SearchMatch {
  line: number;
  /** Colonne de début (base 1) */
  column: number;
  length: number;
  text: string;
}

const MAX_SEARCH_MATCHES = 500;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Recherche plein texte dans les fichiers texte chargés du projet. */
function searchProject(
  files: ProjectFileEntry[],
  query: string,
  caseSensitive: boolean
): { groups: Array<{ path: string; matches: SearchMatch[] }>; total: number; truncated: boolean } {
  const groups: Array<{ path: string; matches: SearchMatch[] }> = [];
  let total = 0;
  const re = new RegExp(escapeRegExp(query), caseSensitive ? 'g' : 'gi');
  for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    if (f.isBinary || !f.content) continue;
    const matches: SearchMatch[] = [];
    const lines = f.content.split(/\r?\n/);
    for (let i = 0; i < lines.length && total < MAX_SEARCH_MATCHES; i++) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(lines[i])) && total < MAX_SEARCH_MATCHES) {
        matches.push({ line: i + 1, column: m.index + 1, length: m[0].length, text: lines[i] });
        total++;
      }
    }
    if (matches.length > 0) groups.push({ path: f.path, matches });
    if (total >= MAX_SEARCH_MATCHES) return { groups, total, truncated: true };
  }
  return { groups, total, truncated: false };
}

/** Ligne de résultat : extrait centré sur la correspondance, mise en évidence. */
const SearchExcerpt: React.FC<{ match: SearchMatch }> = ({ match }) => {
  const start = match.column - 1;
  const from = Math.max(0, start - 12);
  const before = (from > 0 ? '…' : '') + match.text.slice(from, start).trimStart();
  const hit = match.text.slice(start, start + match.length);
  const after = match.text.slice(start + match.length, start + match.length + 80);
  return (
    <span className="truncate">
      {before}
      <mark className="bg-primary-container text-on-primary-container rounded-[2px]">{hit}</mark>
      {after}
    </span>
  );
};

export const SidebarExplorer: React.FC<SidebarExplorerProps> = ({
  files,
  folders,
  rootFile,
  activePath,
  searchRequest,
  onSelectFile,
  onCreateFile,
  onCreateFolder,
  onUploadFiles,
  onRenamePath,
  onDeletePath,
  onSetRootFile,
  onInsertCitation,
}) => {
  const dialogs = useDialogs();
  const [tab, setTab] = useState<'files' | 'outline' | 'citations' | 'search'>('files');
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

  // Recherche dans le projet
  const [searchQuery, setSearchQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const deferredQuery = useDeferredValue(searchQuery);
  const deferredFiles = useDeferredValue(files);

  const tree = useMemo(() => buildFileTree(files, folders), [files, folders]);
  const outline = useMemo(() => extractOutline(files), [files]);
  const searchResults = useMemo(
    () =>
      tab === 'search' && deferredQuery.length >= 2
        ? searchProject(deferredFiles, deferredQuery, caseSensitive)
        : null,
    [tab, deferredFiles, deferredQuery, caseSensitive]
  );

  // Ctrl+Shift+F : bascule sur l'onglet Recherche puis donne le focus au champ, une fois affiché
  const focusSearchRef = useRef(false);
  useEffect(() => {
    if (!searchRequest) return;
    focusSearchRef.current = true;
    setTab('search');
  }, [searchRequest]);
  useEffect(() => {
    if (tab !== 'search' || !focusSearchRef.current) return;
    focusSearchRef.current = false;
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  }, [tab, searchRequest]);

  const toggleFolder = (folderPath: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) next.delete(folderPath);
      else next.add(folderPath);
      return next;
    });
  };

  const handlePromptNewFile = async (folder?: string) => {
    const raw = await dialogs.prompt({
      title: 'Nouveau fichier',
      message: 'Les sous-dossiers sont créés automatiquement.',
      label: 'Chemin du fichier',
      defaultValue: folder ? `${folder}/nouveau.tex` : 'sections/nouvelle-section.tex',
      placeholder: 'sections/methodologie.tex ou references.bib',
      confirmLabel: 'Créer',
    });
    if (!raw) return;
    await onCreateFile(raw);
  };

  const handlePromptNewFolder = async (parent?: string) => {
    const raw = await dialogs.prompt({
      title: 'Nouveau dossier',
      message: 'Indique un chemin pour créer des sous-dossiers (ex. chapitres/annexes).',
      label: 'Chemin du dossier',
      defaultValue: parent ? `${parent}/nouveau-dossier` : 'nouveau-dossier',
      placeholder: 'figures ou chapitres/annexes',
      confirmLabel: 'Créer',
    });
    if (!raw) return;
    await onCreateFolder(raw.replace(/\/+$/, ''));
    // Déplie les dossiers parents pour montrer le nouveau dossier
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      const parts = raw.split('/');
      for (let i = 1; i < parts.length; i++) next.delete(parts.slice(0, i).join('/'));
      return next;
    });
  };

  const handlePromptRename = async (e: React.MouseEvent, currentPath: string, isFolder: boolean) => {
    e.stopPropagation();
    const next = await dialogs.prompt({
      title: isFolder ? 'Renommer le dossier' : 'Renommer le fichier',
      message: 'Modifie le chemin pour déplacer l’élément dans un autre dossier.',
      label: 'Nouveau chemin / nom',
      defaultValue: currentPath,
      confirmLabel: 'Renommer',
    });
    if (!next || next === currentPath) return;
    await onRenamePath(currentPath, next);
  };

  const handlePromptDelete = async (e: React.MouseEvent, targetPath: string, isFolder: boolean) => {
    e.stopPropagation();
    const ok = await dialogs.confirm({
      title: isFolder ? 'Supprimer le dossier ?' : 'Supprimer le fichier ?',
      message: (
        <>
          <code className="font-mono text-code-sm text-on-surface">{targetPath}</code>
          {isFolder ? ' et tout son contenu seront supprimés.' : ' sera supprimé.'}
        </>
      ),
      confirmLabel: 'Supprimer',
      tone: 'danger',
    });
    if (!ok) return;
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

  const rowClass = (active: boolean) =>
    cx(
      'group min-h-6 py-0.5 px-gutter-xs flex items-center justify-between gap-1 rounded-sm select-none cursor-pointer',
      'transition-colors duration-100 ease-out',
      active
        ? 'bg-surface-container-high text-primary-text'
        : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
    );

  const rowActions = 'hidden group-hover:flex group-focus-within:flex items-center shrink-0 -my-0.5';

  const renderNode = (node: TreeNode): React.ReactNode => {
    if (node.isFolder) {
      const isCollapsed = collapsedFolders.has(node.path);
      return (
        <li key={node.path} role="treeitem" aria-expanded={!isCollapsed}>
          <div onClick={() => toggleFolder(node.path)} className={rowClass(false)}>
            <span className="flex items-center gap-gutter-xs min-w-0">
              {isCollapsed ? (
                <ChevronRight className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 shrink-0" />
              )}
              <span className="truncate">{node.name}/</span>
            </span>
            <span className={rowActions}>
              <IconButton
                size="sm"
                label="Nouveau fichier dans ce dossier"
                onClick={(e) => {
                  e.stopPropagation();
                  void handlePromptNewFile(node.path);
                }}
              >
                <FilePlus2 className="w-3 h-3" />
              </IconButton>
              <IconButton
                size="sm"
                label="Nouveau sous-dossier"
                onClick={(e) => {
                  e.stopPropagation();
                  void handlePromptNewFolder(node.path);
                }}
              >
                <FolderPlus className="w-3 h-3" />
              </IconButton>
              <IconButton
                size="sm"
                label="Renommer le dossier"
                onClick={(e) => void handlePromptRename(e, node.path, true)}
              >
                <Pencil className="w-3 h-3" />
              </IconButton>
              <IconButton
                size="sm"
                tone="danger"
                label="Supprimer le dossier"
                onClick={(e) => void handlePromptDelete(e, node.path, true)}
              >
                <Trash2 className="w-3 h-3" />
              </IconButton>
            </span>
          </div>

          {!isCollapsed && (
            <ul
              role="group"
              className="flex flex-col gap-gutter-xs mt-gutter-xs ml-gutter-sm pl-gutter-sm border-l border-outline-variant"
            >
              {node.children.length === 0 ? (
                <li className="min-h-6 py-0.5 pl-gutter-sm flex items-center font-sans text-label-sm italic text-outline select-none">
                  vide
                </li>
              ) : (
                node.children.map((c) => renderNode(c))
              )}
            </ul>
          )}
        </li>
      );
    }

    const isActive = node.path === activePath;
    const isRoot = node.path === rootFile;
    const isTex = node.name.endsWith('.tex');

    return (
      <li key={node.path} role="treeitem" aria-selected={isActive}>
        <div onClick={() => onSelectFile(node.path)} className={cx(rowClass(isActive), 'pl-gutter-sm')}>
          <span className="truncate">{node.name}</span>

          <span className="flex items-center gap-1 shrink-0">
            <span className={rowActions}>
              {isTex && !isRoot && (
                <IconButton
                  size="sm"
                  label="Définir comme root"
                  onClick={(e) => {
                    e.stopPropagation();
                    void onSetRootFile(node.path);
                  }}
                >
                  <Star className="w-3 h-3" />
                </IconButton>
              )}
              <IconButton
                size="sm"
                label="Renommer"
                onClick={(e) => void handlePromptRename(e, node.path, false)}
              >
                <Pencil className="w-3 h-3" />
              </IconButton>
              {files.length > 1 && (
                <IconButton
                  size="sm"
                  tone="danger"
                  label="Supprimer"
                  onClick={(e) => void handlePromptDelete(e, node.path, false)}
                >
                  <Trash2 className="w-3 h-3" />
                </IconButton>
              )}
            </span>
            {isRoot && (
              <span
                className="font-sans text-label-sm text-on-surface-variant"
                title="Fichier principal (point d'entrée de la compilation)"
              >
                root
              </span>
            )}
          </span>
        </div>
      </li>
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
      className={cx(
        'h-full flex flex-col gap-gutter-md p-gutter-sm bg-surface select-none transition-colors duration-100',
        dragOver && 'ring-2 ring-inset ring-primary bg-primary-container'
      )}
    >
      <Tabs
        ariaLabel="Outils du projet"
        className="px-gutter-xs border-b border-outline-variant shrink-0"
        value={tab}
        onChange={setTab}
        items={[
          { id: 'files', label: 'Fichiers' },
          { id: 'outline', label: 'Plan' },
          { id: 'citations', label: 'BibTeX' },
          {
            id: 'search',
            label: <span className="sr-only">Rechercher dans le projet</span>,
            icon: (
              <span title="Rechercher dans le projet (Ctrl+Shift+F)" className="inline-flex">
                <Search className="w-3.5 h-3.5" />
              </span>
            ),
          },
        ]}
      />

      {/* Onglet Fichiers */}
      {tab === 'files' && (
        <div className="flex-1 flex flex-col justify-between gap-gutter-md min-h-0">
          <div className="flex flex-col gap-gutter-sm min-h-0">
            <div className="flex items-center justify-between px-gutter-xs">
              <span className="text-label-sm uppercase tracking-wider text-on-surface-variant">
                Arborescence
              </span>
              <div className="flex items-center gap-gutter-xs">
                <IconButton
                  size="sm"
                  label="Nouveau fichier (.tex, .bib, sous-dossier...)"
                  onClick={() => void handlePromptNewFile()}
                >
                  <FilePlus2 className="w-3.5 h-3.5" />
                </IconButton>
                <IconButton size="sm" label="Nouveau dossier" onClick={() => void handlePromptNewFolder()}>
                  <FolderPlus className="w-3.5 h-3.5" />
                </IconButton>
                <IconButton
                  size="sm"
                  label="Importer des fichiers ou images"
                  onClick={() => uploadInputRef.current?.click()}
                >
                  <Upload className="w-3.5 h-3.5" />
                </IconButton>
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

            <ul
              role="tree"
              aria-label="Fichiers du projet"
              className="flex flex-col gap-gutter-xs overflow-y-auto font-mono text-code-sm font-normal"
            >
              {tree.map((node) => renderNode(node))}
            </ul>
          </div>

          <p className="px-gutter-xs text-body-sm text-on-surface-variant opacity-75">
            Glisser-déposer des fichiers ici
          </p>
        </div>
      )}

      {/* Onglet Recherche dans le projet */}
      {tab === 'search' && (
        <div className="flex-1 flex flex-col gap-gutter-sm min-h-0">
          <div className="flex items-center gap-gutter-xs">
            <input
              ref={searchInputRef}
              type="search"
              aria-label="Rechercher dans tous les fichiers"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchResults?.groups[0]) {
                  const first = searchResults.groups[0];
                  const m = first.matches[0];
                  onSelectFile(first.path, m.line, m.column, m.length);
                }
              }}
              placeholder="Rechercher dans le projet..."
              spellCheck={false}
              className={cx(inputClass, 'h-7 px-gutter-sm rounded-sm bg-surface-container-low text-body-sm')}
            />
            <IconButton
              size="sm"
              label="Respecter la casse"
              aria-pressed={caseSensitive}
              active={caseSensitive}
              onClick={() => setCaseSensitive((v) => !v)}
              className="w-7 h-7"
            >
              <CaseSensitive className="w-4 h-4" />
            </IconButton>
          </div>

          {searchResults === null ? (
            <p className="py-8 px-2 text-center text-body-sm text-on-surface-variant">
              Recherche un mot ou une commande dans tous les fichiers texte du projet.
            </p>
          ) : searchResults.total === 0 ? (
            <p className="py-8 px-2 text-center text-body-sm text-on-surface-variant">Aucun résultat.</p>
          ) : (
            <>
              <p className="px-gutter-xs text-label-sm text-on-surface-variant tabular-nums">
                {searchResults.truncated ? `${MAX_SEARCH_MATCHES}+` : searchResults.total} résultat
                {searchResults.total > 1 ? 's' : ''} dans {searchResults.groups.length} fichier
                {searchResults.groups.length > 1 ? 's' : ''}
              </p>
              <ul className="flex-1 overflow-y-auto flex flex-col gap-gutter-sm" aria-label="Résultats de recherche">
                {searchResults.groups.map((group) => (
                  <li key={group.path} className="flex flex-col">
                    <span
                      className="px-gutter-xs py-0.5 font-mono text-code-sm text-on-surface truncate"
                      title={group.path}
                    >
                      {group.path}
                      <span className="ml-1.5 text-outline tabular-nums">{group.matches.length}</span>
                    </span>
                    <ul className="flex flex-col">
                      {group.matches.map((m) => (
                        <li key={`${m.line}:${m.column}`}>
                          <button
                            type="button"
                            onClick={() => onSelectFile(group.path, m.line, m.column, m.length)}
                            className="w-full flex items-baseline gap-gutter-sm px-gutter-xs py-0.5 rounded-sm text-left font-mono text-code-sm font-normal text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors duration-100"
                          >
                            <span className="w-7 shrink-0 text-right text-outline tabular-nums">{m.line}</span>
                            <SearchExcerpt match={m} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {/* Onglet Plan */}
      {tab === 'outline' && (
        <div className="flex-1 overflow-y-auto">
          {outline.length === 0 ? (
            <p className="text-body-sm text-on-surface-variant text-center py-8 px-3">
              Aucune section (<code className="font-mono text-code-sm">\section&#123;...&#125;</code>)
              détectée dans le projet.
            </p>
          ) : (
            <ul className="flex flex-col gap-gutter-xs">
              {outline.map((item, idx) => {
                const major = item.level <= 2;
                const fileName = item.file.split('/').pop();
                return (
                  <li key={`${item.file}:${item.line}:${idx}`}>
                    <button
                      type="button"
                      onClick={() => onSelectFile(item.file, item.line)}
                      title={`${item.file}:${item.line}`}
                      style={{ paddingLeft: `${4 + Math.max(0, item.level - 2) * 16}px` }}
                      className="w-full flex items-center justify-between gap-2 pr-gutter-xs py-gutter-xs rounded-sm text-left hover:bg-surface-container transition-colors duration-100"
                    >
                      <span
                        className={cx(
                          'truncate',
                          major ? 'text-body-md text-on-surface' : 'text-body-sm text-on-surface-variant'
                        )}
                      >
                        {item.title}
                      </span>
                      <span className="font-mono text-code-sm font-normal text-on-surface-variant tabular-nums shrink-0">
                        {item.file === rootFile ? '' : fileName}:{item.line}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* Onglet BibTeX : recherche arXiv & Crossref */}
      {tab === 'citations' && (
        <div className="flex-1 flex flex-col gap-gutter-sm min-h-0">
          <form onSubmit={handleSearchCitations} className="flex flex-col gap-gutter-xs">
            <div className="flex items-center gap-gutter-xs">
              <input
                type="search"
                aria-label="Rechercher une publication"
                value={citeQuery}
                onChange={(e) => setCiteQuery(e.target.value)}
                placeholder="Titre, auteur, DOI..."
                className={cx(inputClass, 'h-7 px-gutter-sm rounded-sm bg-surface-container-low text-body-sm')}
              />
              <button
                type="submit"
                aria-label="Chercher"
                title="Chercher"
                disabled={citeLoading}
                className="h-7 w-8 shrink-0 inline-flex items-center justify-center rounded-sm bg-primary text-on-primary hover:bg-primary-hover disabled:opacity-60 transition-colors duration-100"
              >
                {citeLoading ? <Spinner className="w-3.5 h-3.5 text-on-primary" /> : <Search className="w-4 h-4" />}
              </button>
            </div>

            <div className="flex items-center gap-gutter-xs" role="radiogroup" aria-label="Source">
              {(['all', 'arxiv', 'crossref'] as const).map((src) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={citeSource === src}
                  key={src}
                  onClick={() => setCiteSource(src)}
                  className={cx(
                    'h-5 px-1.5 rounded-sm text-label-sm transition-colors duration-100',
                    citeSource === src
                      ? 'bg-surface-container-high text-on-surface'
                      : 'text-on-surface-variant hover:text-on-surface'
                  )}
                >
                  {src === 'all' ? 'Tous' : src === 'arxiv' ? 'arXiv' : 'Crossref'}
                </button>
              ))}
            </div>
          </form>

          <div className="flex-1 overflow-y-auto flex flex-col gap-gutter-sm">
            {citeLoading ? (
              <div className="py-10 flex flex-col items-center gap-2 text-body-sm text-on-surface-variant">
                <Spinner />
                Interrogation d'arXiv & Crossref...
              </div>
            ) : citeResults.length === 0 ? (
              <p className="py-8 px-2 text-center text-body-sm text-on-surface-variant">
                Recherche un article scientifique pour l'ajouter à{' '}
                <code className="font-mono text-code-sm text-on-surface">references.bib</code> et insérer{' '}
                <code className="font-mono text-code-sm text-on-surface">\cite&#123;...&#125;</code>.
              </p>
            ) : (
              citeResults.map((item) => (
                <article
                  key={item.id}
                  className="flex flex-col gap-gutter-xs p-gutter-sm rounded-lg bg-surface-container-low border border-outline-variant"
                >
                  <span className="text-label-sm text-tertiary">
                    {item.source === 'arxiv' ? 'arXiv' : 'Crossref'}
                    {item.year ? ` • ${item.year}` : ''}
                  </span>
                  <h4 className="text-label-md text-on-surface">{item.title}</h4>
                  <p className="text-body-sm text-on-surface-variant line-clamp-1">
                    {item.authors.slice(0, 3).join(', ')}
                    {item.authors.length > 3 ? ' et al.' : ''}
                  </p>

                  <div className="mt-gutter-xs flex items-center gap-gutter-xs">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await onInsertCitation(item);
                        } catch {
                          return; // erreur affichée dans le bandeau de l'éditeur
                        }
                        setInsertedId(item.id);
                        setTimeout(() => setInsertedId(null), 1600);
                      }}
                      title="Ajouter à references.bib et insérer \cite au curseur"
                      className="flex-1 h-6 inline-flex items-center justify-center gap-1 px-gutter-sm rounded-sm bg-secondary-container text-on-secondary-container font-mono text-code-sm hover:bg-surface-container-highest transition-colors duration-100"
                    >
                      {insertedId === item.id ? (
                        <>
                          <Check className="w-3 h-3 text-success" />
                          <span className="font-sans text-label-sm">Ajouté</span>
                        </>
                      ) : (
                        '.bib & \\cite'
                      )}
                    </button>
                    <IconButton
                      size="sm"
                      label="Copier l'entrée BibTeX"
                      onClick={() => {
                        void navigator.clipboard.writeText(item.bibtex);
                        setCopiedId(item.id);
                        setTimeout(() => setCopiedId(null), 1400);
                      }}
                    >
                      {copiedId === item.id ? (
                        <Check className="w-3.5 h-3.5 text-success" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </IconButton>
                    {item.url && (
                      <IconButton
                        size="sm"
                        label="Ouvrir la source"
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </IconButton>
                    )}
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      )}
    </aside>
  );
};
