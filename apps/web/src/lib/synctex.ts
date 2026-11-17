import { gunzipSync, strFromU8 } from 'fflate';
import type { SyncTeXForwardResult, SyncTeXInverseResult } from '@prism-latex/shared';

interface SyncBox {
  page: number;
  tag: number;
  line: number;
  /** PDF points (bp) from left edge of page */
  x: number;
  /** PDF points (bp) from top edge of page */
  y: number;
  width: number;
  height: number;
}

export class SyncTeXMapper {
  private filesByTag = new Map<number, string>();
  private tagsByFile = new Map<string, number[]>();
  private boxes: SyncBox[] = [];

  static fromCompressedOrPlain(raw: Uint8Array, knownPaths: string[]): SyncTeXMapper {
    let text: string;
    if (raw.length >= 2 && raw[0] === 0x1f && raw[1] === 0x8b) {
      text = strFromU8(gunzipSync(raw));
    } else {
      text = strFromU8(raw);
    }
    return new SyncTeXMapper(text, knownPaths);
  }

  constructor(synctexText: string, knownPaths: string[]) {
    this.parse(synctexText, knownPaths);
  }

  get hasData(): boolean {
    return this.boxes.length > 0;
  }

  private normalizeInputPath(rawPath: string, knownPaths: string[]): string {
    const cleaned = rawPath
      .trim()
      .replace(/\\/g, '/')
      .replace(/^\.\//, '')
      .replace(/^\/+/, '');

    // Direct match
    if (knownPaths.includes(cleaned)) return cleaned;

    // Suffix match against project paths (e.g. /work/sections/intro.tex -> sections/intro.tex)
    for (const kp of knownPaths) {
      if (cleaned === kp || cleaned.endsWith(`/${kp}`)) {
        return kp;
      }
    }

    const base = cleaned.split('/').pop() ?? cleaned;
    const byBase = knownPaths.find((kp) => kp === base || kp.endsWith(`/${base}`));
    return byBase ?? cleaned;
  }

  private parse(text: string, knownPaths: string[]): void {
    const lines = text.split(/\r?\n/);

    let unit = 1;
    let magnification = 1000;
    let xOffsetSp = 0;
    let yOffsetSp = 0;
    let currentPage = 0;

    for (const line of lines) {
      if (!line) continue;

      if (line.startsWith('Input:')) {
        // Input:<tag>:<path>
        const firstColon = 5;
        const secondColon = line.indexOf(':', firstColon + 1);
        if (secondColon > firstColon) {
          const tag = Number.parseInt(line.slice(firstColon + 1, secondColon), 10);
          const rawFile = line.slice(secondColon + 1);
          if (!Number.isNaN(tag) && rawFile) {
            const norm = this.normalizeInputPath(rawFile, knownPaths);
            this.filesByTag.set(tag, norm);
            const list = this.tagsByFile.get(norm) ?? [];
            list.push(tag);
            this.tagsByFile.set(norm, list);
          }
        }
        continue;
      }

      if (line.startsWith('Unit:')) {
        unit = Number.parseFloat(line.slice(5)) || 1;
        continue;
      }
      if (line.startsWith('Magnification:')) {
        magnification = Number.parseFloat(line.slice(14)) || 1000;
        continue;
      }
      if (line.startsWith('X Offset:')) {
        xOffsetSp = Number.parseFloat(line.slice(9)) || 0;
        continue;
      }
      if (line.startsWith('Y Offset:')) {
        yOffsetSp = Number.parseFloat(line.slice(9)) || 0;
        continue;
      }

      // Page start: `{1`
      if (line.startsWith('{')) {
        const p = Number.parseInt(line.slice(1), 10);
        if (!Number.isNaN(p)) currentPage = p;
        continue;
      }
      if (line.startsWith('}')) {
        currentPage = 0;
        continue;
      }

      if (currentPage <= 0) continue;

      // Convert scaled units to PDF big points (1 bp = 65781.76 sp)
      const toPt = (val: number) => (val * unit * (magnification / 1000)) / 65781.76;
      const xOffPt = toPt(xOffsetSp);
      const yOffPt = toPt(yOffsetSp);

      const kind = line[0];
      // Horizontal/vertical boxes: h<tag>,<line>:<x>,<y>:<W>,<H>,<D> or [<tag>,<line>:<x>,<y>:<W>,<H>,<D>
      if (kind === 'h' || kind === 'v' || kind === '[') {
        const m = line.match(
          /^[hv[](\d+),(\d+):(-?\d+),(-?\d+):(-?\d+),(-?\d+),(-?\d+)/
        );
        if (m) {
          const tag = Number.parseInt(m[1], 10);
          const lineNum = Number.parseInt(m[2], 10);
          if (!this.filesByTag.has(tag) || lineNum <= 0) continue;

          const x = toPt(Number.parseInt(m[3], 10)) + xOffPt;
          const yBaseline = toPt(Number.parseInt(m[4], 10)) + yOffPt;
          const width = Math.max(8, toPt(Number.parseInt(m[5], 10)));
          const height = Math.max(10, toPt(Number.parseInt(m[6], 10)));
          const depth = Math.max(0, toPt(Number.parseInt(m[7], 10)));

          this.boxes.push({
            page: currentPage,
            tag,
            line: lineNum,
            x,
            y: yBaseline - height,
            width,
            height: height + depth,
          });
        }
        continue;
      }

      // Current/kern/glue/math nodes: x<tag>,<line>:<x>,<y>
      if (kind === 'x' || kind === 'k' || kind === 'g' || kind === '$') {
        const m = line.match(/^[xkg$](\d+),(\d+):(-?\d+),(-?\d+)/);
        if (m) {
          const tag = Number.parseInt(m[1], 10);
          const lineNum = Number.parseInt(m[2], 10);
          if (!this.filesByTag.has(tag) || lineNum <= 0) continue;

          const x = toPt(Number.parseInt(m[3], 10)) + xOffPt;
          const yBaseline = toPt(Number.parseInt(m[4], 10)) + yOffPt;

          this.boxes.push({
            page: currentPage,
            tag,
            line: lineNum,
            x,
            y: yBaseline - 11,
            width: 36,
            height: 14,
          });
        }
      }
    }
  }

  /**
   * Editor (file + line) -> PDF coordinates (in PDF points from top-left of page)
   */
  forwardSearch(file: string, line: number): SyncTeXForwardResult | null {
    const clean = file.replace(/\\/g, '/').replace(/^\/+/, '');
    const tags = this.tagsByFile.get(clean);
    if (!tags || tags.length === 0) return null;

    const tagSet = new Set(tags);
    let best: SyncBox | null = null;
    let bestLineDiff = Number.POSITIVE_INFINITY;

    for (const box of this.boxes) {
      if (!tagSet.has(box.tag)) continue;
      const diff = Math.abs(box.line - line);
      if (diff < bestLineDiff) {
        bestLineDiff = diff;
        best = box;
        if (diff === 0) break;
      }
    }

    if (!best || bestLineDiff > 25) return null;
    return {
      page: best.page,
      x: best.x,
      y: best.y,
      width: Math.max(best.width, 120),
      height: Math.max(best.height, 14),
    };
  }

  /**
   * PDF click (page + x, y in PDF points from top-left) -> Editor (file + line)
   */
  inverseSearch(page: number, xPt: number, yPt: number): SyncTeXInverseResult | null {
    let best: SyncBox | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const box of this.boxes) {
      if (box.page !== page) continue;
      const file = this.filesByTag.get(box.tag);
      // Prefer project .tex/.bib files over TeX Live .sty/.cls system files
      if (!file || (!file.endsWith('.tex') && !file.endsWith('.bib'))) continue;

      const dx =
        xPt < box.x ? box.x - xPt : xPt > box.x + box.width ? xPt - (box.x + box.width) : 0;
      const dy =
        yPt < box.y ? box.y - yPt : yPt > box.y + box.height ? yPt - (box.y + box.height) : 0;

      // Vertical proximity is weighted much higher than horizontal proximity on a line
      const score = dy * 6 + dx + box.width * 0.001;
      if (score < bestScore) {
        bestScore = score;
        best = box;
      }
    }

    if (!best) return null;
    const file = this.filesByTag.get(best.tag);
    if (!file) return null;

    return { file, line: best.line };
  }
}
