import { BusyTexRunner, LuaLatex, PdfLatex, XeLatex, type FileInput } from 'texlyre-busytex';
import type { CompilerEngine, DiagnosticItem, ProjectBundleFile } from '@prism-latex/shared';
import { parseLatexLog } from './logParser';

export interface WasmCompilationOutput {
  success: boolean;
  pdf?: Uint8Array;
  synctex?: Uint8Array;
  log: string;
  diagnostics: DiagnosticItem[];
  durationMs: number;
}

export interface WasmStatus {
  phase: 'idle' | 'checking' | 'downloading' | 'compiling' | 'ready' | 'missing-assets' | 'error';
  message: string;
  progressPercent?: number;
}

interface BusyTexManifest {
  available: boolean;
  basePath: string;
  preloadPackages: string[];
  catalogPackages: string[];
}

function base64ToUint8Array(base64: string): Uint8Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

class ClientLatexCompiler {
  private runner: BusyTexRunner | null = null;
  private initPromise: Promise<void> | null = null;
  private statusListeners = new Set<(s: WasmStatus) => void>();
  private currentStatus: WasmStatus = {
    phase: 'idle',
    message: 'Moteur WASM en veille',
  };

  subscribe(listener: (s: WasmStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.currentStatus);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  private emit(status: WasmStatus): void {
    this.currentStatus = status;
    for (const cb of this.statusListeners) {
      cb(status);
    }
  }

  async ensureInitialized(): Promise<boolean> {
    if (this.runner?.isInitialized()) {
      return true;
    }
    if (this.initPromise) {
      await this.initPromise;
      return Boolean(this.runner?.isInitialized());
    }

    this.initPromise = (async () => {
      this.emit({
        phase: 'checking',
        message: 'Vérification des assets WebAssembly TeX Live...',
      });

      const res = await fetch('/api/busytex/manifest', { credentials: 'same-origin' });
      if (!res.ok) {
        throw new Error('Impossible de récupérer le manifeste BusyTeX.');
      }

      const manifest = (await res.json()) as BusyTexManifest;
      if (!manifest.available || manifest.preloadPackages.length === 0) {
        this.emit({
          phase: 'missing-assets',
          message:
            'Assets WASM BusyTeX absents. Exécute `npm run setup:wasm` une fois à la racine du dépôt.',
        });
        return;
      }

      this.emit({
        phase: 'downloading',
        message: 'Initialisation du moteur LaTeX WebAssembly...',
        progressPercent: 5,
      });

      const runner = new BusyTexRunner({
        busytexBasePath: manifest.basePath,
        engineMode: 'combined',
        preloadDataPackages: manifest.preloadPackages,
        catalogDataPackages: manifest.catalogPackages,
        onDownloadProgress: (p) => {
          this.emit({
            phase: 'downloading',
            message: `Chargement des paquets TeX Live (${p.percent}%)...`,
            progressPercent: p.percent,
          });
        },
      });

      await runner.initialize(true);
      this.runner = runner;

      this.emit({
        phase: 'ready',
        message: 'Moteur WASM prêt',
      });
    })();

    try {
      await this.initPromise;
      return Boolean(this.runner?.isInitialized());
    } catch (err) {
      this.runner = null;
      this.emit({
        phase: 'error',
        message: (err as Error).message || 'Erreur lors du démarrage WASM',
      });
      throw err;
    } finally {
      this.initPromise = null;
    }
  }

  async compileProject(params: {
    rootFile: string;
    compiler: CompilerEngine;
    bundleFiles: ProjectBundleFile[];
  }): Promise<WasmCompilationOutput> {
    const start = performance.now();
    const ready = await this.ensureInitialized();
    if (!ready || !this.runner) {
      return {
        success: false,
        log:
          'BusyTeX WebAssembly assets non trouvés dans /core/busytex.\n' +
          'Lancez `npm run setup:wasm` une seule fois sur le serveur ou en local pour télécharger TeX Live WASM.',
        diagnostics: [
          {
            severity: 'error',
            file: params.rootFile,
            line: 1,
            message:
              'Assets WebAssembly TeX Live manquants. Lancez `npm run setup:wasm` dans le terminal.',
          },
        ],
        durationMs: Math.round(performance.now() - start),
      };
    }

    const { rootFile, compiler, bundleFiles } = params;
    const rootEntry = bundleFiles.find((f) => f.path === rootFile);
    if (!rootEntry || rootEntry.isBinary) {
      return {
        success: false,
        log: `Fichier racine "${rootFile}" introuvable ou binaire.`,
        diagnostics: [
          {
            severity: 'error',
            file: rootFile,
            line: 1,
            message: `Fichier racine "${rootFile}" introuvable dans le projet.`,
          },
        ],
        durationMs: Math.round(performance.now() - start),
      };
    }

    const additionalFiles: FileInput[] = [];
    let hasBib = false;
    let usesBiblatex = /\\usepackage(?:\[[^\]]*\])?\{biblatex\}/.test(rootEntry.data);

    for (const f of bundleFiles) {
      if (f.path.endsWith('.bib')) hasBib = true;
      if (!f.isBinary && f.path.endsWith('.tex') && /\\usepackage(?:\[[^\]]*\])?\{biblatex\}/.test(f.data)) {
        usesBiblatex = true;
      }
      if (f.path === rootFile) continue;
      additionalFiles.push({
        path: f.path,
        content: f.isBinary ? base64ToUint8Array(f.data) : f.data,
      });
    }

    // Automatically detect extra catalog packages needed (e.g. beamer,revtex,science,fonts)
    const config = this.runner.getConfig();
    const extraPackages: string[] = [...config.catalogDataPackages];

    this.emit({
      phase: 'compiling',
      message: `Compilation (${compiler})...`,
    });

    try {
      const tool =
        compiler === 'xelatex'
          ? new XeLatex(this.runner)
          : compiler === 'lualatex'
            ? new LuaLatex(this.runner)
            : new PdfLatex(this.runner);

      const result = await tool.compile({
        input: rootEntry.data,
        mainTexPath: rootFile,
        additionalFiles,
        bibtex: hasBib && !usesBiblatex,
        biber: hasBib && usesBiblatex,
        rerun: true,
        dataPackagesJs: extraPackages.length > 0 ? extraPackages : undefined,
      });

      const durationMs = Math.round(performance.now() - start);
      const diagnostics = parseLatexLog(result.log, rootFile);

      this.emit({
        phase: 'ready',
        message: result.success
          ? `Compilé en ${(durationMs / 1000).toFixed(2)}s`
          : 'Erreur de compilation',
      });

      return {
        success: result.success,
        pdf: result.pdf,
        synctex: result.synctex,
        log: result.log,
        diagnostics,
        durationMs,
      };
    } catch (err) {
      const durationMs = Math.round(performance.now() - start);
      const msg = (err as Error).message || 'Erreur interne WASM';
      this.emit({
        phase: 'error',
        message: msg,
      });
      return {
        success: false,
        log: msg,
        diagnostics: [
          {
            severity: 'error',
            file: rootFile,
            line: 1,
            message: msg,
          },
        ],
        durationMs,
      };
    }
  }
}

export const latexCompiler = new ClientLatexCompiler();
