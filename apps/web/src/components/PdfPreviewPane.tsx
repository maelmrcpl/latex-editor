import React, { useEffect, useRef, useState } from 'react';
import {
  Download,
  FileText,
  Loader2,
  MousePointerClick,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { SyncTeXForwardResult } from '@prism-latex/shared';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

interface PdfPreviewPaneProps {
  pdfBytes?: Uint8Array;
  projectName: string;
  compiling: boolean;
  forwardHighlight: (SyncTeXForwardResult & { nonce: number }) | null;
  hasSyncTex: boolean;
  onInverseSync: (page: number, xPt: number, yPt: number) => void;
}

interface PageMetric {
  pageNumber: number;
  widthPt: number;
  heightPt: number;
}

export const PdfPreviewPane: React.FC<PdfPreviewPaneProps> = ({
  pdfBytes,
  projectName,
  compiling,
  forwardHighlight,
  hasSyncTex,
  onInverseSync,
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const pageWrapRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [pages, setPages] = useState<PageMetric[]>([]);
  const [scale, setScale] = useState(1.15);

  // Load PDF document when pdfBytes updates while preserving scroll position
  useEffect(() => {
    if (!pdfBytes || pdfBytes.byteLength === 0) {
      setPdfDoc(null);
      setPages([]);
      return;
    }

    let cancelled = false;
    // Copy buffer because PDF.js transfers the ArrayBuffer to its worker!
    const copy = new Uint8Array(pdfBytes);
    const loadingTask = pdfjsLib.getDocument({ data: copy });

    loadingTask.promise
      .then(async (doc) => {
        if (cancelled) {
          await doc.destroy();
          return;
        }
        const metrics: PageMetric[] = [];
        for (let p = 1; p <= doc.numPages; p++) {
          const page = await doc.getPage(p);
          const vp = page.getViewport({ scale: 1 });
          metrics.push({
            pageNumber: p,
            widthPt: vp.width,
            heightPt: vp.height,
          });
        }
        if (!cancelled) {
          setPdfDoc((prev) => {
            if (prev) void prev.destroy();
            return doc;
          });
          setPages(metrics);
        }
      })
      .catch((err) => {
        console.error('[PDF.js] Load error:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [pdfBytes]);

  // Render pages onto canvases whenever pdfDoc or scale changes
  useEffect(() => {
    if (!pdfDoc || pages.length === 0) return;

    let cancelled = false;
    const savedScrollTop = scrollRef.current?.scrollTop ?? 0;

    (async () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      for (const m of pages) {
        if (cancelled) break;
        const canvas = canvasRefs.current.get(m.pageNumber);
        if (!canvas) continue;

        const page = await pdfDoc.getPage(m.pageNumber);
        const viewport = page.getViewport({ scale });
        const outputViewport = page.getViewport({ scale: scale * dpr });

        canvas.width = Math.floor(outputViewport.width);
        canvas.height = Math.floor(outputViewport.height);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) continue;

        await page.render({
          canvasContext: ctx,
          viewport: outputViewport,
        }).promise;
      }

      if (!cancelled && scrollRef.current && savedScrollTop > 0) {
        scrollRef.current.scrollTop = savedScrollTop;
      }
    })().catch(() => {
      // Ignore cancelled render tasks
    });

    return () => {
      cancelled = true;
    };
  }, [pdfDoc, pages, scale]);

  // Scroll smoothly to Forward SyncTeX target
  useEffect(() => {
    if (!forwardHighlight || !scrollRef.current) return;
    const wrap = pageWrapRefs.current.get(forwardHighlight.page);
    if (!wrap) return;

    const targetOffsetInPage = forwardHighlight.y * scale;
    const top = wrap.offsetTop + targetOffsetInPage - scrollRef.current.clientHeight * 0.35;
    scrollRef.current.scrollTo({
      top: Math.max(0, top),
      behavior: 'smooth',
    });
  }, [forwardHighlight, scale]);

  const handleDownloadPdf = () => {
    if (!pdfBytes) return;
    const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName.replace(/[^a-zA-Z0-9-_]+/g, '_') || 'document'}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handlePageClick = (e: React.MouseEvent<HTMLDivElement>, metric: PageMetric) => {
    if (!e.ctrlKey && !e.metaKey && e.detail < 2) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const xPx = e.clientX - rect.left;
    const yPx = e.clientY - rect.top;
    const xPt = xPx / scale;
    const yPt = yPx / scale;
    onInverseSync(metric.pageNumber, xPt, yPt);
  };

  return (
    <div className="flex flex-col h-full bg-zinc-900/60 min-w-0">
      {/* PDF Toolbar */}
      <div className="h-10 px-3 border-b border-zinc-800 bg-zinc-900/90 flex items-center justify-between text-xs shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setScale((s) => Math.max(0.5, Number((s - 0.15).toFixed(2))))}
            title="Zoom arrière"
            className="p-1 rounded hover:bg-zinc-800 text-zinc-300 cursor-pointer"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="font-mono text-[11px] text-zinc-300 w-12 text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => setScale((s) => Math.min(2.6, Number((s + 0.15).toFixed(2))))}
            title="Zoom avant"
            className="p-1 rounded hover:bg-zinc-800 text-zinc-300 cursor-pointer"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          {pages.length > 0 && (
            <span className="text-[11px] text-zinc-500 ml-2">
              {pages.length} page{pages.length > 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {hasSyncTex && (
            <span
              title="Ctrl+Clic (ou double-clic) sur le PDF pour sauter à la ligne LaTeX"
              className="hidden xl:inline-flex items-center gap-1 text-[11px] text-zinc-400 bg-zinc-800/70 px-2 py-0.5 rounded"
            >
              <MousePointerClick className="w-3 h-3 text-indigo-400" />
              Ctrl+Clic → Code
            </span>
          )}

          {compiling && (
            <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
          )}

          <button
            onClick={handleDownloadPdf}
            disabled={!pdfBytes}
            title="Télécharger le PDF compilé"
            className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 flex items-center gap-1.5 transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            PDF
          </button>
        </div>
      </div>

      {/* Scrollable Pages Area */}
      <div ref={scrollRef} className="flex-1 overflow-auto p-6 flex flex-col items-center gap-6">
        {!pdfBytes ? (
          <div className="my-auto text-center max-w-xs text-zinc-500">
            {compiling ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                <p className="text-xs text-zinc-300">
                  Compilation WebAssembly en cours dans le navigateur...
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <FileText className="w-10 h-10 text-zinc-700" />
                <p className="text-xs text-zinc-400">
                  Clique sur <strong className="text-zinc-200">Compiler</strong> (ou{' '}
                  <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">Ctrl+Entrée</kbd>)
                  pour générer l'aperçu PDF en temps réel.
                </p>
              </div>
            )}
          </div>
        ) : (
          pages.map((m) => {
            const isHighlightedPage = forwardHighlight?.page === m.pageNumber;
            return (
              <div
                key={m.pageNumber}
                ref={(el) => {
                  if (el) pageWrapRefs.current.set(m.pageNumber, el);
                  else pageWrapRefs.current.delete(m.pageNumber);
                }}
                onClick={(e) => handlePageClick(e, m)}
                style={{
                  width: `${Math.floor(m.widthPt * scale)}px`,
                  height: `${Math.floor(m.heightPt * scale)}px`,
                }}
                className="relative bg-white shadow-2xl shadow-black/60 rounded-sm shrink-0 select-none"
              >
                <canvas
                  ref={(el) => {
                    if (el) canvasRefs.current.set(m.pageNumber, el);
                    else canvasRefs.current.delete(m.pageNumber);
                  }}
                  className="block"
                />

                {isHighlightedPage && forwardHighlight && (
                  <div
                    key={forwardHighlight.nonce}
                    style={{
                      left: `${Math.max(0, forwardHighlight.x * scale - 4)}px`,
                      top: `${Math.max(0, forwardHighlight.y * scale - 2)}px`,
                      width: `${Math.min(
                        m.widthPt * scale - forwardHighlight.x * scale,
                        Math.max(140, forwardHighlight.width * scale)
                      )}px`,
                      height: `${Math.max(18, forwardHighlight.height * scale + 4)}px`,
                    }}
                    className="absolute bg-indigo-500/35 border border-indigo-500 rounded synctex-highlight"
                  />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
