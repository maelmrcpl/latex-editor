/** Aperçu textuel d'un document LaTeX (titre, auteurs, premier paragraphe) pour la carte « Dernière session ». */
export interface LatexExcerpt {
  title: string | null;
  authors: string | null;
  text: string | null;
}

/** Contenu de la première accolade équilibrée après `\cmd`. */
function readCommandArg(source: string, cmd: string): string | null {
  const re = new RegExp(`\\\\${cmd}\\*?(?:\\[[^\\]]*\\])?\\s*\\{`);
  const m = re.exec(source);
  if (!m) return null;
  let depth = 1;
  let i = m.index + m[0].length;
  const start = i;
  while (i < source.length && depth > 0) {
    if (source[i] === '\\') i += 2;
    else {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') depth--;
      i++;
    }
  }
  return depth === 0 ? source.slice(start, i - 1) : null;
}

/** Formules hors ligne : illisibles en texte brut, on les retire de l'aperçu. */
const MATH_BLOCKS =
  /\\begin\{(equation|align|gather|multline|eqnarray)\*?\}[\s\S]*?\\end\{\1\*?\}|\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$/g;

/** Retire les commandes LaTeX courantes pour obtenir un texte lisible. */
export function latexToPlainText(input: string): string {
  return input
    .replace(/(?<!\\)%.*$/gm, '')
    .replace(MATH_BLOCKS, ' ')
    .replace(/\\(?:and|AND)\b/g, ' & ')
    .replace(/\\\\/g, ' ')
    .replace(/\$([^$]*)\$/g, '$1')
    .replace(/\\(?:cite[pt]?|ref|eqref|label)\*?(?:\[[^\]]*\])?\{[^}]*\}/g, '')
    .replace(/\\(?:textbf|textit|emph|texttt|underline|mathrm|mathbf|mathcal|mathbb|text|dot|ddot|hat|bar|vec|tilde)\{([^}]*)\}/g, '$1')
    .replace(/\\LaTeX\{?\}?/g, 'LaTeX')
    .replace(/\\TeX\{?\}?/g, 'TeX')
    .replace(/\\[a-zA-Z@]+\*?(?:\[[^\]]*\])?/g, '')
    .replace(/[{}~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractLatexExcerpt(source: string, maxLength = 240): LatexExcerpt {
  const rawTitle = readCommandArg(source, 'title');
  const rawAuthor = readCommandArg(source, 'author');

  const body = (source.split(/\\begin\{document\}/)[1] ?? '').replace(MATH_BLOCKS, ' ');
  let rawText = '';
  const abstract = /\\begin\{abstract\}([\s\S]*?)\\end\{abstract\}/.exec(body);
  if (abstract) {
    rawText = abstract[1];
  } else {
    // Premier paragraphe de texte (on ignore les lignes qui ne sont que des commandes)
    const paragraphs = body
      .split(/\n\s*\n/)
      .map((p) =>
        p
          .split('\n')
          .filter((line) => !/^\s*(\\[a-zA-Z@]+\*?(\[[^\]]*\])?(\{[^}]*\})*\s*)+$/.test(line))
          .join(' ')
      )
      .map(latexToPlainText)
      .filter((p) => p.length > 40);
    rawText = paragraphs[0] ?? '';
  }

  let text = latexToPlainText(rawText);
  if (text.length > maxLength) text = `${text.slice(0, maxLength).replace(/\s+\S*$/, '')}…`;

  return {
    title: rawTitle ? latexToPlainText(rawTitle) || null : null,
    authors: rawAuthor ? latexToPlainText(rawAuthor) || null : null,
    text: text || null,
  };
}
