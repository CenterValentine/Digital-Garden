/**
 * Table detection. OCR-PASTE-PLAN.md D12 (owner smoke 2026-10-08: "the biggest
 * issue was the direct translation of a 3 column table").
 *
 * Tesseract reads a clean table's words and rows correctly but returns flat
 * lines — "Ada Lovelace Lead Engineer Active since 2021" — so the columns are
 * lost. Its word boxes still carry the geometry. A table's signature:
 *
 *   1. CELLS — inside a row, a gap wider than COLUMN_GAP_HEIGHTS word heights
 *      ends a cell (ordinary word spacing is a fraction of a letter's height);
 *   2. COLUMNS — the most common cell count (≥ 2) defines the columns, their
 *      spans taken from the rows that have exactly that many cells;
 *   3. RUN — at least MIN_TABLE_ROWS consecutive rows whose cells each fall in
 *      a distinct column (a missing cell is an empty cell, not a broken row).
 *
 * Two guards against false tables:
 *   - SHORT CELLS: a two-column ARTICLE also has aligned gaps, but its "cells"
 *     are long lines of prose. The median cell must hold ≤ MAX_WORDS_PER_CELL
 *     words.
 *   - ICON COLUMNS: a column whose words Tesseract read with low confidence is
 *     icons or bullets (a sidebar list's glyph column), not data. It is
 *     dropped; fewer than two columns left means no table.
 *
 * The result is a GitHub-flavoured markdown table, which the editor's own
 * paste parser turns into a real table node. Pure; pinned by
 * `pnpm ocr:blocks:check`. Guide: docs/notes-feature/guides/editor/OCR-PIPELINE.md
 */
import { groupRows, medianWordHeight, rowsToText, type OcrLine, type OcrRow, type OcrWord } from "./layout";

/** A gap wider than this many median word heights separates two cells. */
const COLUMN_GAP_HEIGHTS = 1.2;
const MIN_TABLE_ROWS = 3;
const MIN_COLUMNS = 2;
/** Median words per cell above this = prose columns, not a table. */
const MAX_WORDS_PER_CELL = 5;
/** A column whose mean word confidence is below this is icons, not data. */
const ICON_COLUMN_CONFIDENCE = 50;

interface Cell {
  words: OcrWord[];
  x0: number;
  x1: number;
}

function cellsOf(row: OcrRow, gap: number): Cell[] {
  const cells: Cell[] = [];
  for (const word of row.words) {
    const last = cells[cells.length - 1];
    if (last && word.bbox.x0 - last.x1 <= gap) {
      last.words.push(word);
      last.x1 = Math.max(last.x1, word.bbox.x1);
    } else {
      cells.push({ words: [word], x0: word.bbox.x0, x1: word.bbox.x1 });
    }
  }
  return cells;
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length >> 1] ?? 0;
};

/** Column index of each cell (by its center), or null if two cells share a column. */
function placeCells(cells: Cell[], bounds: number[]): (Cell | null)[] | null {
  const placed: (Cell | null)[] = bounds.slice(1).map(() => null);
  for (const cell of cells) {
    const center = (cell.x0 + cell.x1) / 2;
    const col = bounds.findIndex((b, i) => i < bounds.length - 1 && center >= b && center < bounds[i + 1]);
    if (col < 0 || placed[col]) return null;
    placed[col] = cell;
  }
  return placed;
}

const cellText = (cell: Cell | null) =>
  cell ? cell.words.map((w) => w.text.trim()).join(" ").replace(/\|/g, "\\|") : "";

/**
 * The page as markdown with its table as a GFM table, or null when no table
 * is found (callers fall back to the other reading-order rules).
 */
export function tableMarkdown(lines: OcrLine[]): string | null {
  const words = lines.flatMap((l) => l.words);
  const rows = groupRows(words);
  if (rows.length < MIN_TABLE_ROWS) return null;
  const gap = COLUMN_GAP_HEIGHTS * medianWordHeight(words);
  const rowCells = rows.map((row) => cellsOf(row, gap));

  // Columns: the most common multi-cell count, spans from rows that have it.
  const counts = new Map<number, number>();
  for (const cells of rowCells) if (cells.length >= MIN_COLUMNS) counts.set(cells.length, (counts.get(cells.length) ?? 0) + 1);
  if (counts.size === 0) return null;
  const columns = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
  const full = rowCells.filter((cells) => cells.length === columns);
  const lefts = Array.from({ length: columns }, (_, j) => median(full.map((cells) => cells[j].x0)));
  const rights = Array.from({ length: columns }, (_, j) => median(full.map((cells) => cells[j].x1)));
  // Boundaries halfway between one column's right edge and the next one's left.
  const bounds = [Number.NEGATIVE_INFINITY];
  for (let j = 1; j < columns; j++) bounds.push((rights[j - 1] + lefts[j]) / 2);
  bounds.push(Number.POSITIVE_INFINITY);

  // The longest run of consecutive rows with ≥ 2 cells, each in its own column.
  const placed = rowCells.map((cells) => (cells.length >= MIN_COLUMNS ? placeCells(cells, bounds) : null));
  let best = { start: 0, end: -1 };
  let start = -1;
  placed.forEach((p, i) => {
    if (p) {
      if (start < 0) start = i;
      if (i - start > best.end - best.start) best = { start, end: i };
    } else {
      start = -1;
    }
  });
  if (best.end - best.start + 1 < MIN_TABLE_ROWS) return null;
  const table = placed.slice(best.start, best.end + 1) as (Cell | null)[][];

  // Guard: prose columns hold long lines, not short cells.
  const cellWordCounts = table.flatMap((row) => row.filter((c): c is Cell => c !== null).map((c) => c.words.length));
  if (median(cellWordCounts) > MAX_WORDS_PER_CELL) return null;

  // Guard: drop icon/bullet columns (low-confidence glyphs).
  const keep = Array.from({ length: columns }, (_, j) => {
    const confidences = table.flatMap((row) => row[j]?.words.map((w) => w.confidence ?? 100) ?? []);
    if (confidences.length === 0) return false;
    return confidences.reduce((a, b) => a + b, 0) / confidences.length >= ICON_COLUMN_CONFIDENCE;
  });
  if (keep.filter(Boolean).length < MIN_COLUMNS) return null;

  const markdownRow = (row: (Cell | null)[]) => `| ${row.filter((_, j) => keep[j]).map(cellText).join(" | ")} |`;
  const kept = keep.filter(Boolean).length;
  const markdown = [
    markdownRow(table[0]),
    `|${" --- |".repeat(kept)}`,
    ...table.slice(1).map(markdownRow),
  ].join("\n");

  const before = rowsToText(rows.slice(0, best.start));
  const after = rowsToText(rows.slice(best.end + 1));
  return [before, markdown, after].filter(Boolean).join("\n\n");
}
