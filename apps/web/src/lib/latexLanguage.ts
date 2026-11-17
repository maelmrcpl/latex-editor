import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  snippetCompletion,
} from '@codemirror/autocomplete';
import {
  foldService,
  HighlightStyle,
  StreamLanguage,
  syntaxHighlighting,
} from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import type { ProjectFileEntry } from '@prism-latex/shared';

interface LatexStreamState {
  inMathDisplay: boolean;
  inMathInline: boolean;
  inBibtex: boolean;
}

export const latexStreamLanguage = StreamLanguage.define<LatexStreamState>({
  name: 'latex',
  startState: () => ({
    inMathDisplay: false,
    inMathInline: false,
    inBibtex: false,
  }),
  token(stream, state) {
    if (stream.eatSpace()) return null;

    // Comments (%)
    if (stream.peek() === '%') {
      stream.skipToEnd();
      return 'comment';
    }

    // BibTeX @article{...
    if (stream.sol() && stream.match(/^@[a-zA-Z]+/)) {
      state.inBibtex = true;
      return 'def';
    }

    // Display math $$...$$
    if (stream.match('$$')) {
      state.inMathDisplay = !state.inMathDisplay;
      return 'keyword';
    }

    // Inline math $...$
    if (stream.peek() === '$') {
      stream.next();
      state.inMathInline = !state.inMathInline;
      return 'keyword';
    }

    // Backslash commands
    if (stream.peek() === '\\') {
      stream.next();
      if (stream.match(/^[\[\]()]/)) {
        return 'keyword';
      }
      if (stream.match(/^[a-zA-Z@]+\*?/)) {
        const cmd = stream.current();
        if (cmd === '\\begin' || cmd === '\\end') return 'keyword';
        if (
          cmd === '\\part' ||
          cmd === '\\chapter' ||
          cmd === '\\section' ||
          cmd === '\\subsection' ||
          cmd === '\\subsubsection' ||
          cmd === '\\section*' ||
          cmd === '\\subsection*'
        ) {
          return 'heading';
        }
        if (
          cmd === '\\cite' ||
          cmd === '\\citep' ||
          cmd === '\\citet' ||
          cmd === '\\ref' ||
          cmd === '\\eqref' ||
          cmd === '\\label' ||
          cmd === '\\input' ||
          cmd === '\\include' ||
          cmd === '\\usepackage' ||
          cmd === '\\documentclass'
        ) {
          return 'atom';
        }
        return state.inMathInline || state.inMathDisplay ? 'operator' : 'tagName';
      }
      stream.next();
      return 'escape';
    }

    if (stream.match(/^[{}]/)) return 'brace';
    if (stream.match(/^\[\]|\[|\]/)) return 'squareBracket';
    if (stream.match(/^&/)) return 'operator';

    if (state.inMathInline || state.inMathDisplay) {
      if (stream.match(/^[0-9]+(\.[0-9]+)?/)) return 'number';
      if (stream.match(/^[_^=+\-*/<>]/)) return 'operator';
      stream.next();
      return 'variableName';
    }

    if (stream.match(/^[0-9]+/)) return 'number';

    stream.eatWhile(/[^\\$%{}[\]&\s0-9]/);
    return null;
  },
});

const SECTION_LEVELS: Record<string, number> = {
  part: 1,
  chapter: 2,
  section: 3,
  subsection: 4,
  subsubsection: 5,
};

export const latexFoldService = foldService.of((state, lineStart) => {
  const line = state.doc.lineAt(lineStart);
  const text = line.text.trim();

  // 1. Fold \begin{env} ... \end{env}
  const beginMatch = text.match(/^\\begin\{([^}]+)\}/);
  if (beginMatch) {
    const env = beginMatch[1];
    let depth = 1;
    for (let l = line.number + 1; l <= state.doc.lines; l++) {
      const cur = state.doc.line(l);
      const tLine = cur.text;
      if (tLine.includes(`\\begin{${env}}`)) depth++;
      if (tLine.includes(`\\end{${env}}`)) {
        depth--;
        if (depth === 0) {
          return { from: line.to, to: cur.from - 1 };
        }
      }
    }
  }

  // 2. Fold \section{...} until next equal or higher section or \end{document}
  const secMatch = text.match(/^\\(part|chapter|section|subsection|subsubsection)\*?\{/);
  if (secMatch) {
    const level = SECTION_LEVELS[secMatch[1]] ?? 3;
    for (let l = line.number + 1; l <= state.doc.lines; l++) {
      const cur = state.doc.line(l);
      const trimmed = cur.text.trim();
      if (trimmed.startsWith('\\end{document}')) {
        return l > line.number + 1 ? { from: line.to, to: cur.from - 1 } : null;
      }
      const nextSec = trimmed.match(/^\\(part|chapter|section|subsection|subsubsection)\*?\{/);
      if (nextSec && (SECTION_LEVELS[nextSec[1]] ?? 3) <= level) {
        return l > line.number + 1 ? { from: line.to, to: cur.from - 1 } : null;
      }
    }
  }

  return null;
});

const COMMON_ENVIRONMENTS = [
  'equation',
  'equation*',
  'align',
  'align*',
  'itemize',
  'enumerate',
  'figure',
  'table',
  'tabular',
  'theorem',
  'lemma',
  'proof',
  'abstract',
  'frame',
  'block',
  'pmatrix',
  'bmatrix',
  'cases',
  'center',
];

const STATIC_SNIPPETS: Completion[] = [
  snippetCompletion('\\section{${title}}\n\\label{sec:${id}}\n${}', {
    label: '\\section',
    detail: 'Section avec label',
    type: 'keyword',
  }),
  snippetCompletion('\\subsection{${title}}\n${}', {
    label: '\\subsection',
    detail: 'Sous-section',
    type: 'keyword',
  }),
  snippetCompletion('\\frac{${num}}{${den}}', {
    label: '\\frac',
    detail: 'Fraction mathématique',
    type: 'function',
  }),
  snippetCompletion('\\sqrt{${x}}', {
    label: '\\sqrt',
    detail: 'Racine carrée',
    type: 'function',
  }),
  snippetCompletion('\\sum_{${i=1}}^{${n}} ${}', {
    label: '\\sum',
    detail: 'Somme',
    type: 'function',
  }),
  snippetCompletion('\\int_{${a}}^{${b}} ${f(x)} \\, dx', {
    label: '\\int',
    detail: 'Intégrale',
    type: 'function',
  }),
  snippetCompletion('\\textbf{${texte}}', {
    label: '\\textbf',
    detail: 'Gras',
    type: 'function',
  }),
  snippetCompletion('\\emph{${texte}}', {
    label: '\\emph',
    detail: 'Italique / emphase',
    type: 'function',
  }),
  snippetCompletion('\\texttt{${code}}', {
    label: '\\texttt',
    detail: 'Monospace',
    type: 'function',
  }),
  snippetCompletion(
    '\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics[width=0.8\\textwidth]{${image}}\n  \\caption{${Légende}}\n  \\label{fig:${id}}\n\\end{figure}',
    {
      label: '\\begin{figure}',
      detail: 'Figure complète avec légende',
      type: 'keyword',
    }
  ),
  ...[
    '\\alpha',
    '\\beta',
    '\\gamma',
    '\\delta',
    '\\epsilon',
    '\\varepsilon',
    '\\lambda',
    '\\mu',
    '\\pi',
    '\\sigma',
    '\\theta',
    '\\omega',
    '\\Omega',
    '\\Delta',
    '\\Gamma',
    '\\Lambda',
    '\\infty',
    '\\partial',
    '\\nabla',
    '\\forall',
    '\\exists',
    '\\in',
    '\\notin',
    '\\subset',
    '\\subseteq',
    '\\cup',
    '\\cap',
    '\\to',
    '\\mapsto',
    '\\Rightarrow',
    '\\Leftrightarrow',
    '\\approx',
    '\\neq',
    '\\leq',
    '\\geq',
    '\\cdot',
    '\\times',
    '\\mathbb{R}',
    '\\mathcal{L}',
  ].map((cmd) => ({ label: cmd, type: 'constant' as const })),
];

function extractBibEntries(files: ProjectFileEntry[]): Array<{ key: string; title: string }> {
  const entries: Array<{ key: string; title: string }> = [];
  for (const f of files) {
    if (!f.path.endsWith('.bib') || !f.content) continue;
    const blocks = f.content.split(/(?=@[a-zA-Z]+\s*\{)/);
    for (const block of blocks) {
      const head = block.match(/^@[a-zA-Z]+\s*\{\s*([^,\s]+)\s*,/);
      if (!head) continue;
      const key = head[1].trim();
      const titleMatch = block.match(/title\s*=\s*[{"]([^}"]+)[}"]/i);
      entries.push({
        key,
        title: titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim().slice(0, 70) : f.path,
      });
    }
  }
  return entries;
}

function extractLabels(files: ProjectFileEntry[]): Array<{ label: string; file: string }> {
  const out: Array<{ label: string; file: string }> = [];
  for (const f of files) {
    if (!f.path.endsWith('.tex') || !f.content) continue;
    const matches = f.content.matchAll(/\\label\{([^}]+)\}/g);
    for (const m of matches) {
      out.push({ label: m[1].trim(), file: f.path });
    }
  }
  return out;
}

export function createLatexCompletionSource(getFiles: () => ProjectFileEntry[]) {
  return (context: CompletionContext): CompletionResult | null => {
    const lineBefore = context.state.doc
      .lineAt(context.pos)
      .text.slice(0, context.pos - context.state.doc.lineAt(context.pos).from);

    // 1. \cite{...} completion
    const citeMatch = lineBefore.match(/\\cite[a-zA-Z]*\{([^}]*)$/);
    if (citeMatch) {
      const partial = citeMatch[1].split(',').pop()?.trimStart() ?? '';
      const from = context.pos - partial.length;
      const bibEntries = extractBibEntries(getFiles());
      return {
        from,
        options: bibEntries.map((b) => ({
          label: b.key,
          detail: b.title,
          type: 'reference',
        })),
      };
    }

    // 2. \ref{...} or \eqref{...} completion
    const refMatch = lineBefore.match(/\\(?:eq|page|auto)?ref\{([^}]*)$/);
    if (refMatch) {
      const partial = refMatch[1];
      const from = context.pos - partial.length;
      const labels = extractLabels(getFiles());
      return {
        from,
        options: labels.map((l) => ({
          label: l.label,
          detail: l.file,
          type: 'variable',
        })),
      };
    }

    // 3. \input{...} or \include{...} completion
    const inputMatch = lineBefore.match(/\\(?:input|include)\{([^}]*)$/);
    if (inputMatch) {
      const partial = inputMatch[1];
      const from = context.pos - partial.length;
      const texFiles = getFiles().filter((f) => f.path.endsWith('.tex'));
      return {
        from,
        options: texFiles.map((f) => ({
          label: f.path.replace(/\.tex$/, ''),
          detail: f.path,
          type: 'text',
        })),
      };
    }

    // 4. \includegraphics{...} completion
    const imgMatch = lineBefore.match(/\\includegraphics(?:\[[^\]]*\])?\{([^}]*)$/);
    if (imgMatch) {
      const partial = imgMatch[1];
      const from = context.pos - partial.length;
      const imgs = getFiles().filter((f) =>
        /\.(png|jpg|jpeg|pdf|eps)$/i.test(f.path)
      );
      return {
        from,
        options: imgs.map((f) => ({
          label: f.path,
          detail: `${Math.round(f.size / 1024)} Ko`,
          type: 'text',
        })),
      };
    }

    // 5. \begin{...} environment auto-closing completion
    const beginMatch = lineBefore.match(/\\begin\{([a-zA-Z*]*)$/);
    if (beginMatch) {
      const partial = beginMatch[1];
      const from = context.pos - partial.length;
      return {
        from,
        options: COMMON_ENVIRONMENTS.map((env) =>
          snippetCompletion(`${env}}\n  \${}\n\\end{${env}`, {
            label: env,
            detail: `\\begin{${env}} ... \\end{${env}}`,
            type: 'keyword',
          })
        ),
      };
    }

    // 6. General \command completion
    const cmdMatch = context.matchBefore(/\\[a-zA-Z@*]*/);
    if (!cmdMatch || (cmdMatch.from === cmdMatch.to && !context.explicit)) {
      return null;
    }

    return {
      from: cmdMatch.from,
      options: STATIC_SNIPPETS,
    };
  };
}

export const prismDarkHighlight = HighlightStyle.define([
  { tag: t.comment, color: '#71717a', fontStyle: 'italic' },
  { tag: t.keyword, color: '#a78bfa', fontWeight: '600' },
  { tag: t.heading, color: '#38bdf8', fontWeight: '700' },
  { tag: t.atom, color: '#fbbf24' },
  { tag: t.tagName, color: '#818cf8' },
  { tag: t.operator, color: '#34d399' },
  { tag: t.variableName, color: '#6ee7b7' },
  { tag: t.number, color: '#f472b6' },
  { tag: t.definition(t.variableName), color: '#c084fc', fontWeight: '600' },
  { tag: t.brace, color: '#a1a1aa' },
  { tag: t.squareBracket, color: '#94a3b8' },
]);

export const prismDarkEditorTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: '#09090b',
      color: '#e4e4e7',
    },
    '.cm-content': {
      caretColor: '#818cf8',
      padding: '12px 0',
      lineHeight: '1.65',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: '#818cf8',
      borderLeftWidth: '2px',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'rgba(99, 102, 241, 0.25)',
    },
    '.cm-gutters': {
      backgroundColor: '#09090b',
      color: '#52525b',
      borderRight: '1px solid #18181b',
      paddingRight: '4px',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'rgba(39, 39, 42, 0.5)',
      color: '#a1a1aa',
    },
    '.cm-activeLine': {
      backgroundColor: 'rgba(39, 39, 42, 0.35)',
    },
    '.cm-tooltip': {
      backgroundColor: '#18181b',
      border: '1px solid #27272a',
      color: '#e4e4e7',
      borderRadius: '8px',
      boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
    },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
      backgroundColor: 'rgba(99, 102, 241, 0.25)',
      color: '#ffffff',
    },
  },
  { dark: true }
);

export function createLatexExtensions(getFiles: () => ProjectFileEntry[]): Extension[] {
  return [
    latexStreamLanguage,
    latexFoldService,
    syntaxHighlighting(prismDarkHighlight),
    prismDarkEditorTheme,
    autocompletion({
      override: [createLatexCompletionSource(getFiles)],
      activateOnTyping: true,
    }),
  ];
}
