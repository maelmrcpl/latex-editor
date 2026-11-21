import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRightLeft,
  FolderArchive,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Plus,
  Save,
  Settings2,
  X,
} from 'lucide-react';
import type {
  CitationResult,
  CompilerEngine,
  DiagnosticItem,
  ProjectBundleFile,
  ProjectDetail,
  ProjectFileEntry,
  SyncTeXForwardResult,
} from '@prism-latex/shared';
import { api, ApiError } from '../lib/api';
import { EDITOR_FONT_SIZES, useEditorPrefs } from '../lib/editorPrefs';
import { latexCompiler, type WasmStatus } from '../lib/latexCompiler';
import { useTheme } from '../lib/theme';
import { countLatexWords } from '../lib/wordCount';
import { SyncTeXMapper } from '../lib/synctex';
import { CodeMirrorPane, type CodeMirrorHandle } from './CodeMirrorPane';
import { DiagnosticsDrawer } from './DiagnosticsDrawer';
import { PdfPreviewPane } from './PdfPreviewPane';
import { QuickOpen } from './QuickOpen';
import { SidebarExplorer } from './SidebarExplorer';
import { useDialogs } from './ui/Dialog';
import { Button, cx, IconButton, LoadingScreen, Spinner, StatusDot } from './ui';

interface WorkspaceViewProps {
  projectId: string;
  onBack: () => void;
}

export const WorkspaceView: React.FC<WorkspaceViewProps> = ({ projectId, onBack }) => {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [files, setFiles] = useState<ProjectFileEntry[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [activePath, setActivePath] = useState<string>('main.tex');
  const [dirtyPaths, setDirtyPaths] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  /** Dernière sauvegarde en échec (quota atteint, serveur injoignable...) */
  const [saveFailed, setSaveFailed] = useState(false);
  /** Message d'erreur affiché dans le bandeau de l'éditeur */
  const [actionError, setActionError] = useState<string | null>(null);

  // Layout state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(220);
  const [editorRatio, setEditorRatio] = useState(1.25 / 2.25);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [searchRequest, setSearchRequest] = useState(0);
  const [editorPrefs] = useEditorPrefs();
  const dialogs = useDialogs();

  // Compilation & SyncTeX state
  const [autoCompile, setAutoCompile] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [wasmStatus, setWasmStatus] = useState<WasmStatus>({
    phase: 'idle',
    message: 'Prêt',
  });
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | undefined>(undefined);
  const [diagnostics, setDiagnostics] = useState<DiagnosticItem[]>([]);
  const [rawLog, setRawLog] = useState('');
  const [lastDurationMs, setLastDurationMs] = useState<number | null>(null);
  const [cursor, setCursor] = useState<{ line: number; col: number }>({ line: 1, col: 1 });
  const [syncMapper, setSyncMapper] = useState<SyncTeXMapper | null>(null);
  const [forwardHighlight, setForwardHighlight] = useState<
    (SyncTeXForwardResult & { nonce: number }) | null
  >(null);

  const editorRef = useRef<CodeMirrorHandle | null>(null);
  const pendingJumpRef = useRef<{ line: number; column?: number; length?: number } | null>(null);
  const filesLatestRef = useRef<ProjectFileEntry[]>(files);
  const dirtyLatestRef = useRef<Set<string>>(dirtyPaths);

  filesLatestRef.current = files;
  dirtyLatestRef.current = dirtyPaths;

  // Subscribe to WASM engine status
  useEffect(() => {
    return latexCompiler.subscribe(setWasmStatus);
  }, []);

  // Load project detail on mount
  useEffect(() => {
    let active = true;
    api.projects.get(projectId).then(({ project: detail }) => {
      if (!active) return;
      setProject(detail);
      setFiles(detail.files);
      setFolders(detail.folders ?? []);
      const initialPath =
        detail.files.find((f) => f.path === detail.rootFile)?.path ??
        detail.files[0]?.path ??
        'main.tex';
      setActivePath(initialPath);
    });
    return () => {
      active = false;
    };
  }, [projectId]);

  // Execute pending line jump when activePath changes
  useEffect(() => {
    if (pendingJumpRef.current !== null) {
      const target = pendingJumpRef.current;
      pendingJumpRef.current = null;
      requestAnimationFrame(() => {
        editorRef.current?.jumpToLine(target.line, target.column, target.length);
      });
    }
  }, [activePath]);

  // Raccourcis globaux : Ctrl+P (ouvrir un fichier), Ctrl+Shift+F (rechercher dans le projet)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === 'p' && !e.shiftKey) {
        e.preventDefault(); // sinon : impression de la page
        setQuickOpen(true);
      } else if (key === 'f' && e.shiftKey) {
        e.preventDefault();
        setSidebarOpen(true);
        setSearchRequest((n) => n + 1);
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, []);

  const reportError = useCallback((err: unknown, context: string) => {
    const detail =
      err instanceof ApiError
        ? err.message
        : 'serveur injoignable, vérifie ta connexion.';
    setActionError(`${context} : ${detail}`);
  }, []);

  /**
   * Sauvegarde les fichiers texte modifiés. Ne lève jamais d'erreur : en cas d'échec
   * (quota atteint, réseau...), le fichier reste « modifié », le bandeau affiche la raison
   * et la fonction renvoie false. Le contenu reste dans l'éditeur et la compilation continue.
   */
  const flushDirtyFiles = useCallback(async (): Promise<boolean> => {
    const dirtyList = Array.from(dirtyLatestRef.current);
    if (dirtyList.length === 0) return true;

    setSaving(true);
    const saved = new Map<string, string | null>(); // null = rien à envoyer
    let failure: unknown = null;
    try {
      for (const path of dirtyList) {
        const entry = filesLatestRef.current.find((f) => f.path === path);
        if (!entry || entry.isBinary || entry.content === undefined) {
          saved.set(path, null);
          continue;
        }
        const content = entry.content;
        try {
          await api.projects.saveFile(projectId, path, content);
          saved.set(path, content);
        } catch (err) {
          failure = err;
          break;
        }
      }
    } finally {
      setSaving(false);
    }

    // Un fichier n'est « propre » que si son contenu n'a pas changé pendant la sauvegarde
    // Même référence si rien n'a changé : sinon l'autosave se relancerait en boucle après un échec
    setDirtyPaths((prev) => {
      const next = new Set(prev);
      for (const [path, content] of saved) {
        const current = filesLatestRef.current.find((f) => f.path === path);
        if (content === null || !current || current.isBinary || current.content === content) {
          next.delete(path);
        }
      }
      return next.size === prev.size ? prev : next;
    });

    if (failure) {
      setSaveFailed(true);
      reportError(failure, 'Sauvegarde impossible (tes modifications restent dans l\'éditeur)');
      return false;
    }
    setSaveFailed(false);
    setActionError((prev) => (prev?.startsWith('Sauvegarde impossible') ? null : prev));
    return true;
  }, [projectId, reportError]);

  // Prévient avant de quitter la page avec des modifications non sauvegardées
  useEffect(() => {
    if (dirtyPaths.size === 0) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirtyPaths]);

  // Debounced background auto-save (1.2s after typing stops)
  useEffect(() => {
    if (dirtyPaths.size === 0) return;
    const timer = window.setTimeout(() => {
      void flushDirtyFiles();
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [dirtyPaths, files, flushDirtyFiles]);

  // Compile project via client-side WASM
  const runCompilation = useCallback(async () => {
    if (!project || compiling) return;
    setCompiling(true);
    try {
      await flushDirtyFiles();

      // Build bundle: fetch binary files if any exist, overlay latest in-memory text files
      const hasBinaries = filesLatestRef.current.some((f) => f.isBinary);
      let bundleFiles: ProjectBundleFile[];

      if (hasBinaries) {
        const remoteBundle = await api.projects.bundle(projectId);
        const memoryTextMap = new Map<string, string>();
        for (const f of filesLatestRef.current) {
          if (!f.isBinary && f.content !== undefined) {
            memoryTextMap.set(f.path, f.content);
          }
        }
        bundleFiles = remoteBundle.files.map((bf) =>
          !bf.isBinary && memoryTextMap.has(bf.path)
            ? { ...bf, data: memoryTextMap.get(bf.path)! }
            : bf
        );
      } else {
        bundleFiles = filesLatestRef.current.map((f) => ({
          path: f.path,
          isBinary: false,
          data: f.content ?? '',
        }));
      }

      const out = await latexCompiler.compileProject({
        rootFile: project.rootFile,
        compiler: project.compiler,
        bundleFiles,
      });

      setRawLog(out.log);
      setLastDurationMs(out.success ? out.durationMs : null);
      setDiagnostics(out.diagnostics);

      if (out.pdf && out.pdf.byteLength > 0) {
        setPdfBytes(out.pdf);
      }
      if (!out.success) {
        setDrawerOpen(true);
      }

      if (out.synctex && out.synctex.byteLength > 0) {
        try {
          const knownPaths = filesLatestRef.current.map((f) => f.path);
          const mapper = SyncTeXMapper.fromCompressedOrPlain(out.synctex, knownPaths);
          setSyncMapper(mapper.hasData ? mapper : null);
        } catch (err) {
          console.warn('[SyncTeX] Parse warning:', err);
        }
      }
    } catch (err) {
      reportError(err, 'Compilation impossible');
    } finally {
      setCompiling(false);
    }
  }, [compiling, flushDirtyFiles, project, projectId, reportError]);

  // Initial compile once project loads
  const didInitialCompileRef = useRef(false);
  useEffect(() => {
    if (project && !didInitialCompileRef.current) {
      didInitialCompileRef.current = true;
      void runCompilation();
    }
  }, [project, runCompilation]);

  // Optional auto-compile after idle typing
  useEffect(() => {
    if (!autoCompile || dirtyPaths.size === 0) return;
    const timer = window.setTimeout(() => {
      void runCompilation();
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [autoCompile, dirtyPaths, files, runCompilation]);

  const handleEditorChange = (nextContent: string) => {
    setFiles((prev) =>
      prev.map((f) => (f.path === activePath ? { ...f, content: nextContent } : f))
    );
    setDirtyPaths((prev) => {
      const next = new Set(prev);
      next.add(activePath);
      return next;
    });
  };

  const handleSelectFile = (path: string, line?: number, column?: number, length?: number) => {
    if (path === activePath) {
      if (line) editorRef.current?.jumpToLine(line, column, length);
      return;
    }
    if (line) {
      pendingJumpRef.current = { line, column, length };
    }
    setActivePath(path);
  };

  // Forward SyncTeX: Editor -> PDF
  const handleForwardSync = (lineNum?: number) => {
    if (!syncMapper) return;
    const ln = lineNum ?? editorRef.current?.getCursorLine() ?? 1;
    const hit = syncMapper.forwardSearch(activePath, ln);
    if (hit) {
      setForwardHighlight({ ...hit, nonce: Date.now() });
    }
  };

  // Inverse SyncTeX: PDF Ctrl+Click -> Editor
  const handleInverseSync = (page: number, xPt: number, yPt: number) => {
    if (!syncMapper) return;
    const hit = syncMapper.inverseSearch(page, xPt, yPt);
    if (hit) {
      handleSelectFile(hit.file, hit.line);
    }
  };

  const handleCreateFile = async (rawPath: string) => {
    try {
      const res = await api.projects.saveFile(projectId, rawPath, '');
      setFiles((prev) => {
        const filtered = prev.filter((f) => f.path !== res.file.path);
        return [...filtered, res.file].sort((a, b) => a.path.localeCompare(b.path));
      });
      setActivePath(res.file.path);
    } catch (err) {
      reportError(err, 'Création du fichier impossible');
    }
  };

  const handleCreateFolder = async (rawPath: string) => {
    try {
      const res = await api.projects.createFolder(projectId, rawPath);
      setFolders((prev) => [...prev, res.path].sort((a, b) => a.localeCompare(b)));
    } catch (err) {
      reportError(err, 'Création du dossier impossible');
    }
  };

  // Un fichier par requête : ceux déjà envoyés apparaissent même si un suivant est refusé
  const handleUploadFiles = async (fileList: FileList) => {
    for (const file of Array.from(fileList)) {
      try {
        const res = await api.projects.uploadFiles(projectId, [file]);
        setFiles((prev) => {
          const byPath = new Map(prev.map((f) => [f.path, f]));
          for (const up of res.files) {
            byPath.set(up.path, up);
          }
          return Array.from(byPath.values()).sort((a, b) => a.path.localeCompare(b.path));
        });
      } catch (err) {
        reportError(err, `Envoi de « ${file.name} » impossible`);
        return;
      }
    }
  };

  const handleRenamePath = async (oldPath: string, newPath: string) => {
    // Le renommage recharge les fichiers depuis le serveur : on ne perd pas de modifications non sauvegardées
    if (!(await flushDirtyFiles())) return;
    try {
      const res = await api.projects.renamePath(projectId, oldPath, newPath);
      const refreshed = await api.projects.get(projectId);
      setProject(refreshed.project);
      setFiles(refreshed.project.files);
      setFolders(refreshed.project.folders ?? []);
      if (activePath === oldPath) {
        setActivePath(newPath);
      } else if (activePath.startsWith(`${oldPath}/`)) {
        setActivePath(`${newPath}${activePath.slice(oldPath.length)}`);
      } else if (res.rootFile && !refreshed.project.files.some((f) => f.path === activePath)) {
        setActivePath(res.rootFile);
      }
    } catch (err) {
      reportError(err, 'Renommage impossible');
    }
  };

  const handleDeletePath = async (targetPath: string) => {
    try {
      await api.projects.deletePath(projectId, targetPath);
    } catch (err) {
      reportError(err, 'Suppression impossible');
      return;
    }
    setFolders((prev) => prev.filter((p) => p !== targetPath && !p.startsWith(`${targetPath}/`)));
    setDirtyPaths((prev) => {
      const next = new Set(
        [...prev].filter((p) => p !== targetPath && !p.startsWith(`${targetPath}/`))
      );
      return next.size === prev.size ? prev : next;
    });
    setFiles((prev) => {
      const remaining = prev.filter(
        (f) => f.path !== targetPath && !f.path.startsWith(`${targetPath}/`)
      );
      if (!remaining.some((f) => f.path === activePath) && remaining[0]) {
        setActivePath(remaining[0].path);
      }
      return remaining;
    });
  };

  const handleSetRootFile = async (newRoot: string) => {
    if (!project) return;
    try {
      await api.projects.update(projectId, { rootFile: newRoot });
      setProject({ ...project, rootFile: newRoot });
    } catch (err) {
      reportError(err, 'Changement du fichier principal impossible');
    }
  };

  const handleChangeCompiler = async (compiler: CompilerEngine) => {
    if (!project) return;
    try {
      await api.projects.update(projectId, { compiler });
      setProject({ ...project, compiler });
    } catch (err) {
      reportError(err, 'Changement de moteur impossible');
    }
  };

  // Insert BibTeX entry into references.bib and insert \cite{key} in active .tex editor
  const handleInsertCitation = async (citation: CitationResult) => {
    const bibFile =
      files.find((f) => f.path.endsWith('.bib')) ??
      ({
        id: 'temp-bib',
        path: 'references.bib',
        isBinary: false,
        mimeType: 'text/x-bibtex',
        size: 0,
        updatedAt: Date.now(),
        content: '',
      } satisfies ProjectFileEntry);

    const currentBib = bibFile.content ?? '';
    if (!currentBib.includes(citation.citeKey)) {
      const nextBib = `${currentBib.trimEnd()}\n\n${citation.bibtex}\n`.trimStart();
      let saved: Awaited<ReturnType<typeof api.projects.saveFile>>;
      try {
        saved = await api.projects.saveFile(projectId, bibFile.path, nextBib);
      } catch (err) {
        reportError(err, 'Ajout de la référence impossible');
        throw err; // la barre latérale n'affiche pas « inséré »
      }
      setFiles((prev) => {
        const exists = prev.some((f) => f.path === saved.file.path);
        const updated = exists
          ? prev.map((f) => (f.path === saved.file.path ? { ...saved.file, content: nextBib } : f))
          : [...prev, { ...saved.file, content: nextBib }];
        return updated.sort((a, b) => a.path.localeCompare(b.path));
      });
    }

    if (activePath.endsWith('.tex')) {
      editorRef.current?.insertAtCursor(`\\cite{${citation.citeKey}}`);
    }
  };

  // Drag handlers for sidebar width and split editor/PDF ratio
  const startSidebarResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    setResizing(true);
    const onMove = (ev: MouseEvent) => {
      setSidebarWidth(Math.max(190, Math.min(420, startWidth + (ev.clientX - startX))));
    };
    const onUp = () => {
      setResizing(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const startSplitResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setResizing(true);
    const onMove = (ev: MouseEvent) => {
      const container = splitContainerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const ratio = (ev.clientX - rect.left) / rect.width;
      setEditorRatio(Math.max(0.25, Math.min(0.75, ratio)));
    };
    const onUp = () => {
      setResizing(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const activeFile = files.find((f) => f.path === activePath);
  const activeText = activeFile && !activeFile.isBinary ? activeFile.content : undefined;
  const isTexFile = activePath.endsWith('.tex');
  const wordCount = useMemo(
    () => (isTexFile && activeText !== undefined ? countLatexWords(activeText) : null),
    [isTexFile, activeText]
  );

  if (!project) {
    return <LoadingScreen label="Ouverture de l'espace de travail..." />;
  }

  const isDirty = dirtyPaths.size > 0;

  const handleBack = async () => {
    const ok = await flushDirtyFiles();
    if (
      !ok &&
      !(await dialogs.confirm({
        title: 'Quitter sans sauvegarder ?',
        message: "Certaines modifications n'ont pas pu être sauvegardées et seront perdues.",
        confirmLabel: 'Quitter quand même',
        tone: 'danger',
      }))
    ) {
      return;
    }
    onBack();
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-background text-on-background">
      {/* Barre supérieure */}
      <header className="h-12 px-gutter-md border-b border-outline-variant bg-surface flex items-center justify-between gap-gutter-md shrink-0">
        <div className="flex items-center gap-gutter-sm min-w-0">
          <IconButton label="Retour aux projets" onClick={() => void handleBack()} className="rounded-sm">
            <ArrowLeft className="w-[18px] h-[18px]" />
          </IconButton>
          <IconButton
            label={sidebarOpen ? 'Masquer le panneau latéral' : 'Afficher le panneau latéral'}
            onClick={() => setSidebarOpen((o) => !o)}
            className="rounded-sm"
          >
            {sidebarOpen ? (
              <PanelLeftClose className="w-[18px] h-[18px]" />
            ) : (
              <PanelLeftOpen className="w-[18px] h-[18px]" />
            )}
          </IconButton>

          <div className="flex items-center gap-gutter-sm min-w-0 ml-gutter-xs">
            <span className="font-display text-title-md text-on-surface truncate" title={project.name}>
              {project.name}
            </span>
            <button
              type="button"
              onClick={() => setQuickOpen(true)}
              title="Ouvrir un autre fichier (Ctrl+P)"
              className="hidden lg:inline font-mono text-code-sm font-normal text-on-surface-variant hover:text-on-surface truncate max-w-[260px] rounded-sm transition-colors duration-100"
            >
              {activePath}
            </button>
            <span className="hidden sm:inline-flex shrink-0" role="status">
              {saving ? (
                <span className="inline-flex items-center gap-gutter-xs text-label-sm text-on-surface-variant">
                  <Spinner className="w-3 h-3" />
                  Sauvegarde...
                </span>
              ) : isDirty && saveFailed ? (
                <StatusDot tone="error" title={actionError ?? undefined} className="text-label-sm text-error">
                  Non sauvegardé
                </StatusDot>
              ) : isDirty ? (
                <StatusDot tone="warning" className="text-label-sm">
                  Modifié
                </StatusDot>
              ) : (
                <StatusDot tone="success" className="text-label-sm">
                  Sauvegardé
                </StatusDot>
              )}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-gutter-sm shrink-0">
          <CompileStatus status={wasmStatus} durationMs={lastDurationMs} />

          <select
            value={project.compiler}
            onChange={(e) => void handleChangeCompiler(e.target.value as CompilerEngine)}
            title="Moteur TeX Live WASM"
            aria-label="Moteur de compilation"
            className="h-7 pl-gutter-sm pr-1 rounded-sm bg-surface-container-low border border-outline-variant font-mono text-code-sm font-normal text-on-surface focus:outline-none focus:border-primary"
          >
            <option value="pdflatex">pdfLaTeX</option>
            <option value="xelatex">XeLaTeX</option>
            <option value="lualatex">LuaLaTeX</option>
          </select>

          <label
            className="hidden md:inline-flex items-center gap-gutter-xs h-7 px-gutter-sm rounded-sm text-label-md text-on-surface-variant hover:bg-surface-container cursor-pointer select-none transition-colors duration-100"
            title="Compiler automatiquement après la frappe"
          >
            <input
              type="checkbox"
              checked={autoCompile}
              onChange={(e) => setAutoCompile(e.target.checked)}
              className="w-3.5 h-3.5 accent-primary"
            />
            Auto
          </label>

          <IconButton
            label="SyncTeX : aller de la ligne courante au PDF (Ctrl+Shift+J)"
            onClick={() => handleForwardSync()}
            disabled={!syncMapper}
            className="rounded-sm"
          >
            <ArrowRightLeft className="w-[18px] h-[18px]" />
          </IconButton>
          <IconButton
            label="Exporter le projet complet (.zip)"
            href={api.projects.exportZipUrl(projectId)}
            className="rounded-sm"
          >
            <FolderArchive className="w-[18px] h-[18px]" />
          </IconButton>
          <IconButton label="Sauvegarder (Ctrl+S)" onClick={() => void flushDirtyFiles()} className="rounded-sm">
            <Save className="w-[18px] h-[18px]" />
          </IconButton>
          <EditorSettingsMenu />

          <Button
            variant="primary"
            size="md"
            onClick={() => void runCompilation()}
            disabled={compiling}
            loading={compiling}
            icon={<Play className="w-4 h-4 fill-current" />}
            title="Compiler en PDF via WebAssembly (Ctrl+Entrée)"
            className="px-gutter-md"
          >
            Compiler
          </Button>
        </div>
      </header>

      {actionError && (
        <div
          role="alert"
          className="px-3 py-1.5 border-b border-outline-variant bg-error-container text-on-error-container text-body-sm flex items-center gap-2 shrink-0 animate-surface-enter"
        >
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1 min-w-0">{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            title="Masquer"
            aria-label="Masquer"
            className="w-6 h-6 rounded-sm flex items-center justify-center hover:bg-on-error-container/10 transition-colors duration-100"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Corps : panneau latéral · éditeur · aperçu PDF */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <div
          style={{ width: sidebarOpen ? `${sidebarWidth}px` : '0px' }}
          className={cx(
            'shrink-0 h-full overflow-hidden border-r border-outline-variant',
            !sidebarOpen && 'border-r-0',
            !resizing &&
              (sidebarOpen
                ? 'transition-[width] duration-[220ms] ease-enter'
                : 'transition-[width] duration-150 ease-exit')
          )}
          aria-hidden={!sidebarOpen}
          inert={!sidebarOpen}
        >
          <div style={{ width: `${sidebarWidth}px` }} className="h-full">
            <SidebarExplorer
              projectId={projectId}
              files={files}
              folders={folders}
              rootFile={project.rootFile}
              activePath={activePath}
              searchRequest={searchRequest}
              onSelectFile={handleSelectFile}
              onCreateFile={handleCreateFile}
              onCreateFolder={handleCreateFolder}
              onUploadFiles={handleUploadFiles}
              onRenamePath={handleRenamePath}
              onDeletePath={handleDeletePath}
              onSetRootFile={handleSetRootFile}
              onInsertCitation={handleInsertCitation}
            />
          </div>
        </div>
        {sidebarOpen && <ResizeHandle onMouseDown={startSidebarResize} label="Redimensionner le panneau latéral" />}

        <div ref={splitContainerRef} className="flex-1 flex min-w-0 h-full">
          {/* Éditeur ou aperçu d'un fichier binaire */}
          <section
            aria-label="Éditeur LaTeX"
            style={{ width: `${editorRatio * 100}%` }}
            className="h-full flex flex-col min-w-0 bg-surface-container-lowest"
          >
            {!activeFile ? (
              <div className="flex-1 flex items-center justify-center text-body-sm text-on-surface-variant bg-surface-container-lowest">
                Sélectionne un fichier dans l'arborescence.
              </div>
            ) : activeFile.isBinary ? (
              <div className="flex-1 flex flex-col items-center justify-center p-gutter-xl bg-surface-container-lowest gap-4 overflow-auto">
                {activeFile.mimeType.startsWith('image/') ? (
                  <img
                    src={api.projects.rawUrl(projectId, activeFile.path)}
                    alt={activeFile.path}
                    className="max-w-full max-h-[70vh] rounded-lg border border-outline-variant object-contain bg-surface-container-low p-2"
                  />
                ) : (
                  <div className="text-body-sm text-on-surface-variant tabular-nums">
                    Fichier binaire ({activeFile.mimeType}) — {Math.round(activeFile.size / 1024)} Ko
                  </div>
                )}
                <p className="text-body-sm text-on-surface-variant">
                  Utilisable dans LaTeX via{' '}
                  <code className="font-mono text-code-sm text-primary-text">
                    \includegraphics&#123;{activeFile.path}&#125;
                  </code>
                </p>
              </div>
            ) : (
              <CodeMirrorPane
                ref={editorRef}
                filePath={activeFile.path}
                value={activeFile.content ?? ''}
                allFiles={files}
                diagnostics={diagnostics}
                onChange={handleEditorChange}
                onSaveShortcut={() => {
                  void flushDirtyFiles();
                  if (autoCompile) void runCompilation();
                }}
                onCompileShortcut={() => {
                  void runCompilation();
                }}
                onForwardSyncShortcut={(ln) => handleForwardSync(ln)}
                onCursorChange={(line, col) => setCursor({ line, col })}
                lineWrapping={editorPrefs.lineWrapping}
              />
            )}
            {activeFile && !activeFile.isBinary && (
              <div className="px-gutter-md py-gutter-xs flex items-center justify-end gap-gutter-md bg-surface-container-lowest font-mono text-code-sm font-normal text-outline tabular-nums shrink-0">
                {wordCount !== null && (
                  <span title="Estimation pour ce fichier : préambule, commandes et formules exclus">
                    {wordCount.toLocaleString('fr-FR')} mot{wordCount > 1 ? 's' : ''}
                  </span>
                )}
                <span>
                  Ln {cursor.line}, Col {cursor.col}
                </span>
              </div>
            )}
          </section>

          <ResizeHandle onMouseDown={startSplitResize} label="Redimensionner l'éditeur et l'aperçu" />

          {/* Aperçu PDF + diagnostics */}
          <div style={{ width: `${(1 - editorRatio) * 100}%` }} className="h-full flex flex-col min-w-0">
            <div className="flex-1 min-h-0">
              <PdfPreviewPane
                pdfBytes={pdfBytes}
                projectName={project.name}
                compiling={compiling}
                forwardHighlight={forwardHighlight}
                hasSyncTex={Boolean(syncMapper)}
                onInverseSync={handleInverseSync}
              />
            </div>

            <DiagnosticsDrawer
              diagnostics={diagnostics}
              rawLog={rawLog}
              open={drawerOpen}
              onToggle={() => setDrawerOpen((o) => !o)}
              onJumpToLocation={(file, line) => handleSelectFile(file, line)}
            />
          </div>
        </div>
      </div>

      {quickOpen && (
        <QuickOpen
          files={files}
          activePath={activePath}
          onClose={() => setQuickOpen(false)}
          onSelect={(path) => {
            setQuickOpen(false);
            handleSelectFile(path);
            requestAnimationFrame(() => editorRef.current?.focus());
          }}
        />
      )}
    </div>
  );
};

/** Réglages d'affichage : thème, taille du texte et retour à la ligne de l'éditeur. */
const EditorSettingsMenu: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useTheme();
  const [prefs, setPrefs] = useEditorPrefs();
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const segment = (active: boolean) =>
    cx(
      'flex-1 h-7 rounded-sm text-label-md transition-colors duration-100',
      active ? 'bg-surface-container-high text-on-surface' : 'text-on-surface-variant hover:text-on-surface'
    );

  return (
    <div ref={rootRef} className="relative">
      <IconButton
        label="Réglages d'affichage"
        aria-haspopup="dialog"
        aria-expanded={open}
        active={open}
        onClick={() => setOpen((o) => !o)}
        className="rounded-sm"
      >
        <Settings2 className="w-[18px] h-[18px]" />
      </IconButton>
      {open && (
        <div
          role="dialog"
          aria-label="Réglages d'affichage"
          className="absolute right-0 top-full mt-gutter-xs z-40 w-64 p-gutter-md flex flex-col gap-gutter-md bg-surface border border-outline-variant rounded-xl shadow-overlay animate-surface-enter"
        >
          <div className="flex flex-col gap-gutter-xs">
            <span className="text-label-sm text-on-surface-variant">Thème</span>
            <div className="flex gap-1 p-0.5 rounded-lg bg-surface-container-low border border-outline-variant" role="radiogroup" aria-label="Thème">
              {(['dark', 'light'] as const).map((t) => (
                <button key={t} type="button" role="radio" aria-checked={theme === t} onClick={() => setTheme(t)} className={segment(theme === t)}>
                  {t === 'dark' ? 'Sombre' : 'Clair'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-gutter-sm">
            <span className="text-label-sm text-on-surface-variant">Taille du texte</span>
            <div className="flex items-center gap-1">
              <IconButton
                size="sm"
                label="Réduire la taille du texte"
                disabled={prefs.fontSize <= EDITOR_FONT_SIZES.min}
                onClick={() => setPrefs({ fontSize: prefs.fontSize - 1 })}
              >
                <Minus className="w-3.5 h-3.5" />
              </IconButton>
              <span className="w-10 text-center font-mono text-code-sm text-on-surface tabular-nums">{prefs.fontSize} px</span>
              <IconButton
                size="sm"
                label="Agrandir la taille du texte"
                disabled={prefs.fontSize >= EDITOR_FONT_SIZES.max}
                onClick={() => setPrefs({ fontSize: prefs.fontSize + 1 })}
              >
                <Plus className="w-3.5 h-3.5" />
              </IconButton>
            </div>
          </div>

          <label className="flex items-center justify-between gap-gutter-sm cursor-pointer select-none">
            <span className="text-label-sm text-on-surface-variant">Retour à la ligne automatique</span>
            <input
              type="checkbox"
              checked={prefs.lineWrapping}
              onChange={(e) => setPrefs({ lineWrapping: e.target.checked })}
              className="w-3.5 h-3.5 accent-primary"
            />
          </label>
        </div>
      )}
    </div>
  );
};

/** Poignée de redimensionnement verticale (zone de saisie de 5 px, trait de 1 px). */
const ResizeHandle: React.FC<{ onMouseDown: (e: React.MouseEvent) => void; label: string }> = ({
  onMouseDown,
  label,
}) => (
  <div
    role="separator"
    aria-orientation="vertical"
    aria-label={label}
    onMouseDown={onMouseDown}
    className="group relative w-px shrink-0 bg-outline-variant cursor-col-resize"
  >
    <span className="absolute inset-y-0 -left-0.5 -right-0.5 z-10 group-hover:bg-primary transition-colors duration-100" />
  </div>
);

/** Statut compact du moteur : durée de la dernière compilation, ou étape en cours. */
const CompileStatus: React.FC<{ status: WasmStatus; durationMs: number | null }> = ({
  status,
  durationMs,
}) => {
  const base = 'hidden xl:inline-flex items-center gap-gutter-xs text-label-sm tabular-nums max-w-[240px]';
  if (status.phase === 'missing-assets' || status.phase === 'error') {
    return (
      <span
        title={status.message}
        className={cx(base, 'h-6 px-gutter-sm rounded-sm bg-warning-container text-on-warning-container')}
      >
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">{status.message}</span>
      </span>
    );
  }
  if (status.phase === 'compiling') {
    return (
      <span title={status.message} className={cx(base, 'text-on-surface-variant')}>
        Compilation...
      </span>
    );
  }
  if (status.phase === 'downloading' || status.phase === 'checking') {
    return (
      <span title={status.message} className={cx(base, 'text-on-surface-variant')}>
        <Spinner className="w-3 h-3" />
        <span className="truncate">{status.message}</span>
      </span>
    );
  }
  if (status.phase === 'ready' && durationMs !== null) {
    return (
      <span title={status.message} className={cx(base, 'text-on-surface-variant')}>
        {(durationMs / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} s
      </span>
    );
  }
  return (
    <span
      title={status.message}
      className={cx(base, status.message === 'Erreur de compilation' ? 'text-error' : 'text-on-surface-variant')}
    >
      <span className="truncate">{status.message}</span>
    </span>
  );
};
