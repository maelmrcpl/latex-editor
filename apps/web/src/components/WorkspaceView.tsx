import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRightLeft,
  CheckCircle2,
  Download,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Save,
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
import { latexCompiler, type WasmStatus } from '../lib/latexCompiler';
import { SyncTeXMapper } from '../lib/synctex';
import { CodeMirrorPane, type CodeMirrorHandle } from './CodeMirrorPane';
import { DiagnosticsDrawer } from './DiagnosticsDrawer';
import { PdfPreviewPane } from './PdfPreviewPane';
import { SidebarExplorer } from './SidebarExplorer';
import { SynTeXLogo } from './SynTeXLogo';

interface WorkspaceViewProps {
  projectId: string;
  onBack: () => void;
}

export const WorkspaceView: React.FC<WorkspaceViewProps> = ({ projectId, onBack }) => {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [files, setFiles] = useState<ProjectFileEntry[]>([]);
  const [activePath, setActivePath] = useState<string>('main.tex');
  const [dirtyPaths, setDirtyPaths] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  /** Dernière sauvegarde en échec (quota atteint, serveur injoignable...) */
  const [saveFailed, setSaveFailed] = useState(false);
  /** Message d'erreur affiché dans le bandeau de l'éditeur */
  const [actionError, setActionError] = useState<string | null>(null);

  // Layout state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(250);
  const [editorRatio, setEditorRatio] = useState(0.5);
  const [drawerOpen, setDrawerOpen] = useState(false);

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
  const [syncMapper, setSyncMapper] = useState<SyncTeXMapper | null>(null);
  const [forwardHighlight, setForwardHighlight] = useState<
    (SyncTeXForwardResult & { nonce: number }) | null
  >(null);

  const editorRef = useRef<CodeMirrorHandle | null>(null);
  const pendingJumpLineRef = useRef<number | null>(null);
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
    if (pendingJumpLineRef.current !== null) {
      const targetLine = pendingJumpLineRef.current;
      pendingJumpLineRef.current = null;
      requestAnimationFrame(() => {
        editorRef.current?.jumpToLine(targetLine);
      });
    }
  }, [activePath]);

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

  const handleSelectFile = (path: string, line?: number) => {
    if (path === activePath) {
      if (line) editorRef.current?.jumpToLine(line);
      return;
    }
    if (line) {
      pendingJumpLineRef.current = line;
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
    const onMove = (ev: MouseEvent) => {
      setSidebarWidth(Math.max(190, Math.min(420, startWidth + (ev.clientX - startX))));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const startSplitResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const onMove = (ev: MouseEvent) => {
      const container = splitContainerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const ratio = (ev.clientX - rect.left) / rect.width;
      setEditorRatio(Math.max(0.25, Math.min(0.75, ratio)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  if (!project) {
    return (
      <div className="h-screen bg-zinc-950 text-zinc-400 flex items-center justify-center gap-2 text-sm">
        <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
        Ouverture de l'espace de travail...
      </div>
    );
  }

  const activeFile = files.find((f) => f.path === activePath);
  const isDirty = dirtyPaths.size > 0;

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-zinc-950 text-zinc-100">
      {/* Top Workspace Header */}
      <header className="h-12 px-3 border-b border-zinc-800 bg-zinc-950 flex items-center justify-between gap-3 shrink-0">
        {/* Left: Back, Sidebar Toggle, Project Title & Active File */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={async () => {
              const ok = await flushDirtyFiles();
              if (
                !ok &&
                !window.confirm(
                  "Certaines modifications n'ont pas pu être sauvegardées et seront perdues. Quitter quand même ?"
                )
              ) {
                return;
              }
              onBack();
            }}
            title="Retour aux projets"
            className="p-1.5 rounded-lg hover:bg-zinc-900 text-zinc-400 hover:text-zinc-100 transition cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <button
            onClick={() => setSidebarOpen((o) => !o)}
            title={sidebarOpen ? 'Masquer le panneau latéral' : 'Afficher le panneau latéral'}
            className="p-1.5 rounded-lg hover:bg-zinc-900 text-zinc-400 hover:text-zinc-100 transition cursor-pointer"
          >
            {sidebarOpen ? (
              <PanelLeftClose className="w-4 h-4" />
            ) : (
              <PanelLeftOpen className="w-4 h-4" />
            )}
          </button>

          <div className="h-4 w-px bg-zinc-800 mx-0.5" />

          <SynTeXLogo variant="compact" className="mr-1 shrink-0" />
          <span className="text-zinc-700">|</span>
          <span className="font-medium text-sm text-zinc-100 truncate max-w-[200px]">
            {project.name}
          </span>
          <span className="text-zinc-600">/</span>
          <span className="font-mono text-xs text-indigo-300 truncate max-w-[220px]">
            {activePath}
          </span>

          <span className="ml-2 text-[11px] text-zinc-500 hidden md:inline-flex items-center gap-1">
            {saving ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Sauvegarde...
              </>
            ) : isDirty && saveFailed ? (
              <span className="text-red-400 flex items-center gap-1" title={actionError ?? undefined}>
                <AlertTriangle className="w-3 h-3" />
                Non sauvegardé
              </span>
            ) : isDirty ? (
              <span className="text-amber-400">● Modifié</span>
            ) : (
              <>
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                Sauvegardé
              </>
            )}
          </span>
        </div>

        {/* Right: WASM status, Engine selector, SyncTeX, Save, Compile */}
        <div className="flex items-center gap-2 shrink-0">
          <span
            title={wasmStatus.message}
            className={`hidden lg:inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border ${
              wasmStatus.phase === 'missing-assets' || wasmStatus.phase === 'error'
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400'
            }`}
          >
            {(wasmStatus.phase === 'downloading' || wasmStatus.phase === 'compiling') && (
              <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
            )}
            <span className="max-w-[230px] truncate">{wasmStatus.message}</span>
          </span>

          <select
            value={project.compiler}
            onChange={(e) => void handleChangeCompiler(e.target.value as CompilerEngine)}
            title="Moteur TeX Live WASM"
            className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="pdflatex">pdfLaTeX</option>
            <option value="xelatex">XeLaTeX</option>
            <option value="lualatex">LuaLaTeX</option>
          </select>

          <label className="hidden sm:flex items-center gap-1.5 text-xs text-zinc-400 px-2 py-1 rounded-lg hover:bg-zinc-900 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoCompile}
              onChange={(e) => setAutoCompile(e.target.checked)}
              className="accent-indigo-500 rounded"
            />
            Auto
          </label>

          <button
            onClick={() => handleForwardSync()}
            disabled={!syncMapper}
            title="SyncTeX : Sauter de la ligne courante vers le PDF (Ctrl+Shift+J)"
            className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 border border-zinc-800 text-zinc-300 cursor-pointer"
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
          </button>

          <a
            href={api.projects.exportZipUrl(projectId)}
            title="Exporter le projet complet (.zip)"
            className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300"
          >
            <Download className="w-3.5 h-3.5" />
          </a>

          <button
            onClick={() => void flushDirtyFiles()}
            title="Sauvegarder (Ctrl+S)"
            className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => void runCompilation()}
            disabled={compiling}
            title="Compiler en PDF via WebAssembly (Ctrl+Entrée)"
            className="px-3.5 py-1.5 rounded-lg bg-[#5236FF] hover:bg-[#634BFF] disabled:opacity-60 text-xs font-medium text-white flex items-center gap-1.5 shadow-lg shadow-[#5236FF]/25 transition cursor-pointer"
          >
            {compiling ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            Compiler
          </button>
        </div>
      </header>

      {actionError && (
        <div
          role="alert"
          className="px-4 py-2 border-b border-red-500/30 bg-red-500/10 text-xs text-red-200 flex items-center gap-2 shrink-0"
        >
          <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
          <span className="flex-1 min-w-0">{actionError}</span>
          <button
            onClick={() => setActionError(null)}
            title="Masquer"
            className="p-1 rounded hover:bg-red-500/20 text-red-300 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main 3-column Body */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {sidebarOpen && (
          <>
            <div style={{ width: `${sidebarWidth}px` }} className="shrink-0 h-full">
              <SidebarExplorer
                projectId={projectId}
                files={files}
                rootFile={project.rootFile}
                activePath={activePath}
                onSelectFile={handleSelectFile}
                onCreateFile={handleCreateFile}
                onUploadFiles={handleUploadFiles}
                onRenamePath={handleRenamePath}
                onDeletePath={handleDeletePath}
                onSetRootFile={handleSetRootFile}
                onInsertCitation={handleInsertCitation}
              />
            </div>
            <div
              onMouseDown={startSidebarResize}
              className="w-1 bg-zinc-900 hover:bg-indigo-500/60 cursor-col-resize transition shrink-0"
            />
          </>
        )}

        {/* Split Editor + PDF Pane */}
        <div ref={splitContainerRef} className="flex-1 flex min-w-0 h-full">
          {/* Center: CodeMirror or Binary Asset Preview */}
          <div
            style={{ width: `${editorRatio * 100}%` }}
            className="h-full flex flex-col min-w-0 border-r border-zinc-800"
          >
            {!activeFile ? (
              <div className="flex-1 flex items-center justify-center text-xs text-zinc-500">
                Sélectionne un fichier dans l'arborescence.
              </div>
            ) : activeFile.isBinary ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 bg-zinc-950 gap-4 overflow-auto">
                {activeFile.mimeType.startsWith('image/') ? (
                  <img
                    src={api.projects.rawUrl(projectId, activeFile.path)}
                    alt={activeFile.path}
                    className="max-w-full max-h-[70vh] rounded-lg border border-zinc-800 shadow-xl object-contain bg-zinc-900/50 p-2"
                  />
                ) : (
                  <div className="text-xs text-zinc-400">
                    Fichier binaire ({activeFile.mimeType}) — {Math.round(activeFile.size / 1024)} Ko
                  </div>
                )}
                <p className="text-xs font-mono text-zinc-500">
                  Utilisable dans LaTeX via{' '}
                  <code className="text-indigo-300">
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
              />
            )}
          </div>

          {/* Drag divider */}
          <div
            onMouseDown={startSplitResize}
            className="w-1 bg-zinc-900 hover:bg-indigo-500/60 cursor-col-resize transition shrink-0"
          />

          {/* Right: Live PDF.js Viewer + Collapsible Diagnostics */}
          <div
            style={{ width: `${(1 - editorRatio) * 100}%` }}
            className="h-full flex flex-col min-w-0"
          >
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
    </div>
  );
};
