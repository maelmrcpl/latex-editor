import type { DiagnosticItem } from '@prism-latex/shared';

function cleanLogFilePath(raw: string, rootFile: string): string {
  const cleaned = raw
    .trim()
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .replace(/^work\//, '')
    .replace(/^tmp\//, '');
  return cleaned || rootFile;
}

/**
 * Parses standard TeX Live / pdfLaTeX / XeLaTeX / BibTeX logs into structured diagnostics.
 */
export function parseLatexLog(log: string, rootFile = 'main.tex'): DiagnosticItem[] {
  if (!log) return [];

  const lines = log.split(/\r?\n/);
  const diagnostics: DiagnosticItem[] = [];
  const seen = new Set<string>();

  let currentFile = rootFile;
  const fileStack: string[] = [rootFile];

  const pushUnique = (item: DiagnosticItem) => {
    const key = `${item.severity}:${item.file}:${item.line ?? 0}:${item.message}`;
    if (!seen.has(key)) {
      seen.add(key);
      diagnostics.push(item);
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track basic TeX `(./path/to/file.tex` stack changes
    const openMatches = line.matchAll(/\(\.\/([^\s()]+\.(?:tex|sty|cls|bbl|bib))/g);
    for (const m of openMatches) {
      const f = cleanLogFilePath(m[1], rootFile);
      fileStack.push(f);
      currentFile = f;
    }

    // 1. file:line: error style (e.g. ./main.tex:42: Undefined control sequence.)
    const fileLineErr = line.match(/^(?:\.\/|\/)?([^\s:]+\.(?:tex|sty|cls|bib|bbl)):(\d+):\s*(.+)$/);
    if (fileLineErr) {
      const file = cleanLogFilePath(fileLineErr[1], rootFile);
      const lineNum = Number.parseInt(fileLineErr[2], 10);
      let msg = fileLineErr[3].trim();
      if (i + 1 < lines.length && lines[i + 1].trim() && !lines[i + 1].startsWith('l.')) {
        msg = `${msg} ${lines[i + 1].trim()}`.slice(0, 240);
      }
      pushUnique({
        severity: 'error',
        file,
        line: Number.isNaN(lineNum) ? null : lineNum,
        message: msg,
      });
      continue;
    }

    // 2. Classic `! LaTeX Error: ...` or `! Undefined control sequence.`
    if (line.startsWith('! ')) {
      const errorMsg = line.slice(2).trim();
      let lineNum: number | null = null;
      let contextSnippet = '';

      for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
        const sub = lines[j];
        const lMatch = sub.match(/^l\.(\d+)\s*(.*)$/);
        if (lMatch) {
          lineNum = Number.parseInt(lMatch[1], 10);
          contextSnippet = lMatch[2].trim();
          break;
        }
      }

      pushUnique({
        severity: 'error',
        file: currentFile,
        line: lineNum,
        message: contextSnippet ? `${errorMsg} (${contextSnippet})` : errorMsg,
      });
      continue;
    }

    // 3. LaTeX / Package Warnings
    const warnMatch = line.match(/^(?:LaTeX|Package\s+\S+)\s+Warning:\s*(.+)$/i);
    if (warnMatch) {
      let fullWarn = warnMatch[1].trim();
      if (i + 1 < lines.length && lines[i + 1].startsWith('(')) {
        fullWarn += ' ' + lines[i + 1].replace(/^\([^)]+\)\s*/, '').trim();
      }
      const lineMatch = fullWarn.match(/on input line (\d+)/i);
      pushUnique({
        severity: 'warning',
        file: currentFile,
        line: lineMatch ? Number.parseInt(lineMatch[1], 10) : null,
        message: fullWarn,
      });
      continue;
    }

    // 4. BibTeX errors/warnings
    const bibWarn = line.match(/^Warning--(.+)$/);
    if (bibWarn) {
      pushUnique({
        severity: 'warning',
        file: 'references.bib',
        line: null,
        message: `BibTeX: ${bibWarn[1].trim()}`,
      });
    }
  }

  return diagnostics;
}
