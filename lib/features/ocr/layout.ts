/**
 * Reading order. OCR-PASTE-PLAN.md D11 (owner smoke 2026-10-08: a terminal
 * screenshot of six "✓ Compiled in 135ms" lines came back as "Compiled
 * Compiled …" / "in in …" / "135ms 128ms …").
 *
 * Tesseract's layout analysis treats evenly spaced words that line up
 * vertically — monospace terminal output, tables, aligned UI labels — as
 * separate text COLUMNS and reads each column top to bottom. The words are
 * right; the order is not. Confidence cannot see this (the bad read scored 86).
 *
 * Rule: when the page is FRAGMENTED — most of its lines hold one or two words
 * — rebuild it row by row from each word's bounding box. Prose, including a
 * real two-column article, has long lines and keeps Tesseract's own order,
 * because merging true columns row-wise would interleave two texts.
 *
 * Pure; pinned by `pnpm ocr:blocks:check`.
 */

export interface OcrBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
export interface OcrWord {
  text: string;
  bbox: OcrBox;
}
export interface OcrLine {
  words: OcrWord[];
}

/** A line with at most this many words is a fragment. */
const FRAGMENT_MAX_WORDS = 2;
/** Rebuild when at least this share of lines are fragments… */
const FRAGMENTED_SHARE = 0.6;
/** …and there are at least this many lines (a two-line caption is not a table). */
const FRAGMENTED_MIN_LINES = 4;
/** A gap this many row-heights tall between rows is a paragraph break. */
const PARAGRAPH_GAP_ROWS = 1.6;
/**
 * A word taller than this many median word heights may not stretch a row's
 * band. Tesseract can glue glyphs from stacked rows into one tall "word" (three
 * ✓ marks read as "NNN"); letting it widen the band merged three rows into one.
 */
const TALL_WORD = 1.5;

export function isFragmented(lines: OcrLine[]): boolean {
  const real = lines.filter((l) => l.words.some((w) => w.text.trim()));
  if (real.length < FRAGMENTED_MIN_LINES) return false;
  const fragments = real.filter((l) => l.words.filter((w) => w.text.trim()).length <= FRAGMENT_MAX_WORDS).length;
  return fragments / real.length >= FRAGMENTED_SHARE;
}

const centerY = (b: OcrBox) => (b.y0 + b.y1) / 2;

/**
 * Words → rows: a word joins the row whose vertical band contains its center;
 * rows read left to right, top to bottom; an unusually tall gap between rows
 * becomes a blank line (paragraph break for the reflow step).
 */
export function rowsFromWords(words: OcrWord[]): string {
  const usable = words.filter((w) => w.text.trim());
  if (usable.length === 0) return "";
  const wordHeights = usable.map((w) => w.bbox.y1 - w.bbox.y0).sort((a, b) => a - b);
  const medianWord = wordHeights[wordHeights.length >> 1] || 1;
  const isTall = (w: OcrWord) => w.bbox.y1 - w.bbox.y0 > TALL_WORD * medianWord;
  // Normal-height words first, so rows take their bands from real text.
  const sorted = [...usable].sort(
    (a, b) => Number(isTall(a)) - Number(isTall(b)) || centerY(a.bbox) - centerY(b.bbox),
  );
  const rows: { y0: number; y1: number; words: OcrWord[] }[] = [];
  for (const word of sorted) {
    const c = centerY(word.bbox);
    const tall = isTall(word);
    const row = rows.find((r) => c >= r.y0 && c <= r.y1);
    if (row) {
      row.words.push(word);
      if (!tall) {
        row.y0 = Math.min(row.y0, word.bbox.y0);
        row.y1 = Math.max(row.y1, word.bbox.y1);
      }
    } else {
      // A tall word with no row of its own gets a normal-height band at its center.
      const half = tall ? medianWord / 2 : (word.bbox.y1 - word.bbox.y0) / 2;
      rows.push({ y0: c - half, y1: c + half, words: [word] });
    }
  }
  rows.sort((a, b) => a.y0 - b.y0);
  const heights = rows.map((r) => r.y1 - r.y0).sort((a, b) => a - b);
  const rowHeight = heights[heights.length >> 1] || 1;
  let out = "";
  rows.forEach((row, i) => {
    const text = row.words
      .sort((a, b) => a.bbox.x0 - b.bbox.x0)
      .map((w) => w.text.trim())
      .join(" ");
    if (i > 0) out += row.y0 - rows[i - 1].y1 > PARAGRAPH_GAP_ROWS * rowHeight ? "\n\n" : "\n";
    out += text;
  });
  return out;
}

/** Tesseract's text, or the row-rebuilt text when its lines are fragments. */
export function readingOrderText(tesseractText: string, lines: OcrLine[]): string {
  return isFragmented(lines) ? rowsFromWords(lines.flatMap((l) => l.words)) : tesseractText;
}
