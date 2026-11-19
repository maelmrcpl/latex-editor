import { Hono } from 'hono';
import type { CitationResult } from '@prism-latex/shared';
import type { AppVariables } from '../middleware/auth.js';
import { requireApproved, requireAuth } from '../middleware/auth.js';

export const citationRoutes = new Hono<{ Variables: AppVariables }>();
citationRoutes.use('*', requireAuth, requireApproved);

function slugifyToken(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function buildCiteKey(authors: string[], year: number | null, title: string): string {
  const firstAuthor = authors[0] ?? 'author';
  const lastName = firstAuthor.includes(',')
    ? firstAuthor.split(',')[0].trim()
    : firstAuthor.trim().split(/\s+/).pop() ?? 'author';

  const stopWords = new Set(['the', 'and', 'for', 'with', 'from', 'into', 'une', 'des', 'les', 'sur', 'dans']);
  const firstWord =
    title
      .split(/\s+/)
      .map((w) => slugifyToken(w))
      .find((w) => w.length >= 4 && !stopWords.has(w)) || 'paper';

  return `${slugifyToken(lastName) || 'ref'}${year ?? ''}${firstWord}`;
}

const BIBTEX_ESCAPES: Record<string, string> = {
  '\\': '\\textbackslash{}',
  '{': '\\{',
  '}': '\\}',
  '&': '\\&',
  '%': '\\%',
  $: '\\$',
  '#': '\\#',
  _: '\\_',
  '^': '\\textasciicircum{}',
  '~': '\\textasciitilde{}',
};

/**
 * Les métadonnées viennent d'API externes (arXiv, Crossref) : on neutralise tout caractère
 * actif LaTeX/BibTeX pour qu'un titre piégé ne puisse ni casser l'entrée ni injecter de commande.
 */
function escapeBibtex(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\\{}&%$#_^~]/g, (ch) => BIBTEX_ESCAPES[ch]);
}

/** Identifiants (DOI, arXiv) insérés tels quels : on ne garde que les caractères sûrs. */
function sanitizeIdentifier(value: string): string {
  return value.replace(/[^\w.\-/:;()<>]/g, '').slice(0, 200);
}

/** URL de source affichée en lien cliquable : uniquement http(s). */
function safeHttpUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

async function searchArxiv(query: string): Promise<CitationResult[]> {
  const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=8`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'PrismLatexHomelab/0.1 (Academic Reference Search)' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return [];

  const xml = await res.text();
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
  const results: CitationResult[] = [];

  for (const entry of entries) {
    const idRaw = entry.match(/<id>([\s\S]*?)<\/id>/)?.[1]?.trim() ?? '';
    const arxivId = sanitizeIdentifier(
      idRaw.replace(/^https?:\/\/arxiv\.org\/abs\//, '').replace(/v\d+$/, '')
    );
    const title = decodeXmlEntities(
      (entry.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '').replace(/\s+/g, ' ').trim()
    );
    const summary = decodeXmlEntities(
      (entry.match(/<summary>([\s\S]*?)<\/summary>/)?.[1] ?? '').replace(/\s+/g, ' ').trim()
    );
    if (!arxivId) continue;
    const published = entry.match(/<published>(\d{4})/)?.[1];
    const year = published ? Number.parseInt(published, 10) : null;

    const authorMatches = [...entry.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g)];
    const authors = authorMatches.map((m) => decodeXmlEntities(m[1].trim())).filter(Boolean);

    if (!title) continue;
    const citeKey = buildCiteKey(authors, year, title);
    const bibAuthors = authors.join(' and ');

    const bibtex = `@article{${citeKey},
  title = {${escapeBibtex(title)}},
  author = {${escapeBibtex(bibAuthors)}},
  year = {${year ?? ''}},
  eprint = {${arxivId}},
  archivePrefix = {arXiv},
  url = {https://arxiv.org/abs/${arxivId}}
}`;

    results.push({
      id: `arxiv:${arxivId}`,
      source: 'arxiv',
      title,
      authors,
      year,
      venue: `arXiv:${arxivId}`,
      url: `https://arxiv.org/abs/${arxivId}`,
      abstract: summary.slice(0, 360),
      citeKey,
      bibtex,
    });
  }

  return results;
}

interface CrossrefItem {
  DOI?: string;
  title?: string[];
  author?: Array<{ given?: string; family?: string; name?: string }>;
  issued?: { 'date-parts'?: number[][] };
  'container-title'?: string[];
  publisher?: string;
  type?: string;
  URL?: string;
}

async function searchCrossref(query: string): Promise<CitationResult[]> {
  const url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=8`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'PrismLatexHomelab/0.1 (Academic Reference Search)' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return [];

  const json = (await res.json()) as { message?: { items?: CrossrefItem[] } };
  const items = json.message?.items ?? [];
  const results: CitationResult[] = [];

  for (const item of items) {
    const title = item.title?.[0]?.replace(/\s+/g, ' ').trim();
    if (!title) continue;

    const authors = (item.author ?? [])
      .map((a) => (a.family && a.given ? `${a.family}, ${a.given}` : a.family || a.name || ''))
      .filter(Boolean);

    const rawYear = Number(item.issued?.['date-parts']?.[0]?.[0]);
    const year = Number.isInteger(rawYear) ? rawYear : null;
    const venue = item['container-title']?.[0] ?? item.publisher;
    const doi = item.DOI ? sanitizeIdentifier(item.DOI) || undefined : undefined;
    const citeKey = buildCiteKey(authors, year, title);
    const entryType = item.type === 'proceedings-article' ? 'inproceedings' : item.type === 'book' ? 'book' : 'article';
    const venueField = entryType === 'inproceedings' ? 'booktitle' : 'journal';

    const lines = [
      `@${entryType}{${citeKey},`,
      `  title = {${escapeBibtex(title)}},`,
      authors.length > 0 ? `  author = {${escapeBibtex(authors.join(' and '))}},` : null,
      venue ? `  ${venueField} = {${escapeBibtex(venue)}},` : null,
      year ? `  year = {${year}},` : null,
      doi ? `  doi = {${doi}},` : null,
      `}`,
    ].filter(Boolean);

    results.push({
      id: `crossref:${doi ?? citeKey}`,
      source: 'crossref',
      title,
      authors,
      year,
      venue,
      doi,
      url: doi ? `https://doi.org/${doi}` : safeHttpUrl(item.URL),
      citeKey,
      bibtex: lines.join('\n'),
    });
  }

  return results;
}

citationRoutes.get('/search', async (c) => {
  const query = (c.req.query('q') ?? '').trim();
  const source = c.req.query('source') ?? 'all';

  if (query.length < 2) {
    return c.json({ results: [] });
  }

  const tasks: Array<Promise<CitationResult[]>> = [];
  if (source === 'all' || source === 'arxiv') {
    tasks.push(searchArxiv(query).catch(() => []));
  }
  if (source === 'all' || source === 'crossref') {
    tasks.push(searchCrossref(query).catch(() => []));
  }

  const settled = await Promise.all(tasks);
  const results = settled.flat();

  return c.json({ results });
});
