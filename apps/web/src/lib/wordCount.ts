import { latexToPlainText } from './latexExcerpt';

/** Commandes dont l'argument n'est pas du texte rédigé (noms de fichiers, clés, réglages...). */
const NON_TEXT_COMMANDS =
  /\\(?:begin|end|input|include|includeonly|includegraphics|usepackage|RequirePackage|documentclass|bibliography|bibliographystyle|addbibresource|label|ref|eqref|pageref|autoref|cref|Cref|cite[a-zA-Z]*|url|newcommand|renewcommand|providecommand|newenvironment|DeclareMathOperator|vspace|hspace|setlength|addtolength|setcounter|graphicspath|hypersetup|geometry|color|textcolor|definecolor)\*?(?:\[[^\]]*\])*(?:\{[^{}]*\})*/g;

/** Formules en ligne : comptées comme rien, comme le fait texcount par défaut. */
const INLINE_MATH = /\\\((?:[\s\S]*?)\\\)|(?<!\\)\$(?:[^$\\]|\\[\s\S])+?(?<!\\)\$/g;

/**
 * Estimation du nombre de mots rédigés d'un fichier LaTeX : préambule, commentaires,
 * commandes et formules exclus. Approximatif par nature (macros personnalisées...).
 */
export function countLatexWords(source: string): number {
  let body = source;
  const begin = body.search(/\\begin\{document\}/);
  if (begin !== -1) body = body.slice(begin);
  const end = body.search(/\\end\{document\}/);
  if (end !== -1) body = body.slice(0, end);

  const text = latexToPlainText(
    body
      .replace(/(?<!\\)%.*$/gm, '')
      .replace(INLINE_MATH, ' ')
      .replace(NON_TEXT_COMMANDS, ' ')
  );
  const matches = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’\-.]*/gu);
  return matches ? matches.length : 0;
}
