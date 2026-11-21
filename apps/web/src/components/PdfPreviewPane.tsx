import React, { useEffect, useRef, useState } from 'react';
import { Download, FileText, MousePointerClick, ZoomIn, ZoomOut } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { SyncTeXForwardResult } from '@prism-latex/shared';
import { Button, IconButton, Kbd, Spinner } from './ui';

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
    <div className="flex flex-col h-full bg-surface-container-low min-w-0">
      {/* Barre d'outils PDF */}
      <div className="h-10 px-gutter-md border-b border-outline-variant flex items-center justify-between gap-gutter-sm shrink-0">
        <div className="flex items-center gap-gutter-xs">
          <IconButton
            size="sm"
            label="Zoom arrière"
            className="w-7 h-7"
            onClick={() => setScale((s) => Math.max(0.5, Number((s - 0.15).toFixed(2))))}
          >
            <ZoomOut className="w-4 h-4" />
          </IconButton>
          <span className="font-mono text-code-sm text-on-surface px-gutter-xs min-w-[3.25rem] text-center tabular-nums">
            {Math.round(scale * 100)} %
          </span>
          <IconButton
            size="sm"
            label="Zoom avant"
            className="w-7 h-7"
            onClick={() => setScale((s) => Math.min(2.6, Number((s + 0.15).toFixed(2))))}
          >
            <ZoomIn className="w-4 h-4" />
          </IconButton>
          {pages.length > 0 && (
            <span className="text-body-sm text-on-surface-variant ml-gutter-sm tabular-nums">
              {pages.length} page{pages.length > 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div className="flex items-center gap-gutter-sm">
          {hasSyncTex && (
            <span
              title="Ctrl+Clic (ou double-clic) sur le PDF pour sauter à la ligne LaTeX"
              className="hidden 2xl:inline-flex items-center gap-1.5 text-label-sm text-outline"
            >
              <MousePointerClick className="w-3.5 h-3.5" />
              Ctrl+Clic → code
            </span>
          )}

          {compiling && <Spinner className="w-3.5 h-3.5" />}

          <Button
            size="sm"
            variant="ghost"
            onClick={handleDownloadPdf}
            disabled={!pdfBytes}
            title="Télécharger le PDF compilé"
            icon={<Download className="w-4 h-4" />}
            className="px-gutter-sm"
          >
            PDF
          </Button>
        </div>
      </div>

      {/* Pages */}
      <div ref={scrollRef} className="flex-1 overflow-auto p-gutter-lg flex flex-col items-start gap-gutter-lg">
        {!pdfBytes ? (
          <div className="m-auto text-center max-w-xs text-on-surface-variant">
            {compiling ? (
              <div className="flex flex-col items-center gap-3">
                <Spinner className="w-6 h-6" />
                <p className="text-body-md">Compilation WebAssembly en cours dans le navigateur...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <FileText className="w-8 h-8 text-outline" />
                <p className="text-body-md">
                  Clique sur <strong className="text-on-surface font-semibold">Compiler</strong> (ou{' '}
                  <Kbd>Ctrl+Entrée</Kbd>) pour générer l'aperçu PDF.
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
                className="relative mx-auto bg-sheet shadow-sheet shrink-0 select-none"
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
                    className="absolute bg-primary/20 border border-primary rounded-sm synctex-highlight"
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
