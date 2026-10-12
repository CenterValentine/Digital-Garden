/**
 * Table detection. OCR-PASTE-PLAN.md D12 (owner smoke 2026-10-08: "the biggest
 * issue was the direct translation of a 3 column table"; 2026-10-09: wrapped
 * cells split into extra rows, and a line with text in one column ended the
 * table early).
 *
 * Tesseract reads a table's words correctly but returns flat lines. Its word
 * boxes still carry the geometry:
 *
 *   1. CELLS — inside a visual line, a gap wider than COLUMN_GAP_HEIGHTS word
 *      heights ends a cell (ordinary word spacing is a fraction of a letter).
 *   2. COLUMNS — the most common cell count (≥ 2) defines the columns; their
 *      edges come from the lines that have exactly that many cells. A cell
 *      belongs to the column its center falls in, and may not run into the
 *      next column's text.
 *   3. ROWS — a table row can span several visual lines (a wrapped cell).
 *      Lines inside a cell sit one line-height apart: the tightest spacing in
 *      the table. A row break adds the cell padding on top. So a line whose
 *      distance from the previous one is within CONTINUATION_PITCH of the
 *      tightest spacing CONTINUES the row (its cells append to their columns,
 *      even when only one column has text on that line); a wider step starts
 *      a new row, which must have text in at least two columns. Only when the
 *      table HAS two spacings — evenly spaced lines are one row each.
 *   4. TABLE — at least MIN_TABLE_ROWS rows.
 *
 * Guards against false tables:
 *   - PROSE COLUMNS: a two-column article also has aligned gaps. A table has
 *     either short cells (median ≤ MAX_WORDS_PER_CELL words) or a short header
 *     row (every cell ≤ HEADER_MAX_WORDS words); an article has neither.
 *   - ICON COLUMNS: a column of low-confidence glyphs (a sidebar's icons) is
 *     dropped; fewer than two columns left means no table.
 *
 * Output: a GitHub-flavoured markdown table, which the editor's own paste
 * parser turns into a table node. Pure; pinned by `pnpm ocr:blocks:check`.
 * Guide: docs/notes-feature/guides/editor/OCR-PIPELINE.md
 */
import { groupRows, medianWordHeight, rowsToText, type OcrLine, type OcrRow, type OcrWord } from "./layout";

/** A gap wider than this many median word heights separates two cells. */
const COLUMN_GAP_HEIGHTS = 1.2;
const MIN_TABLE_ROWS = 3;
const MIN_COLUMNS = 2;
/**
 * A line within this factor of the table's tightest line spacing continues
 * the row above (a wrapped cell). Measured on the owner's table: lines inside
 * a cell 27–28 px apart, header → first row 40 px (1.48×), rows 68 px (2.5×).
 */
const CONTINUATION_PITCH = 1.25;
/** Short-celled tables need no header… */
const MAX_WORDS_PER_CELL = 5;
/** …long-celled ones must open with a header row this short. */
const HEADER_MAX_WORDS = 4;
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

const textOf = (cell: Cell) => cell.words.map((w) => w.text.trim()).join(" ");

/** Join a wrapped cell's lines: "Mobile-" + "Friendliness" keeps the hyphen; "infor-" + "mation" drops it. */
function joinCellLines(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  if (a.endsWith("-")) return /^[a-z]/.test(b) ? a.slice(0, -1) + b : a + b;
  return `${a} ${b}`;
}

interface Columns {
  count: number;
  lefts: number[];
  bounds: number[];
}

/**
 * Each cell's column, or null when the line does not fit the columns: two
 * cells in one column, or a cell crossing into a neighbouring column (a
 * full-width line of prose under the table).
 */
function placeCells(cells: Cell[], cols: Columns): (Cell | null)[] | null {
  const placed: (Cell | null)[] = Array.from({ length: cols.count }, () => null);
  for (const cell of cells) {
    const center = (cell.x0 + cell.x1) / 2;
    const col = cols.bounds.findIndex((b, i) => i < cols.count && center >= b && center < cols.bounds[i + 1]);
    if (col < 0 || placed[col]) return null;
    // A cell must sit inside its own column on BOTH sides: it may not run into
    // the next column's text, nor start inside the previous column's span (a
    // full-width note under the table starts at the left margin).
    if (col + 1 < cols.count && cell.x1 > cols.lefts[col + 1]) return null;
    if (col > 0 && cell.x0 < cols.bounds[col]) return null;
    placed[col] = cell;
  }
  return placed;
}

const centerY = (row: OcrRow) => (row.y0 + row.y1) / 2;

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

  // Columns: the most common multi-cell count, edges from lines that have it.
  const counts = new Map<number, number>();
  for (const cells of rowCells) if (cells.length >= MIN_COLUMNS) counts.set(cells.length, (counts.get(cells.length) ?? 0) + 1);
  if (counts.size === 0) return null;
  const count = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
  const full = rowCells.filter((cells) => cells.length === count);
  const lefts = Array.from({ length: count }, (_, j) => median(full.map((cells) => cells[j].x0)));
  const rights = Array.from({ length: count }, (_, j) => median(full.map((cells) => cells[j].x1)));
  const bounds = [Number.NEGATIVE_INFINITY];
  for (let j = 1; j < count; j++) bounds.push((rights[j - 1] + lefts[j]) / 2);
  bounds.push(Number.POSITIVE_INFINITY);
  const cols: Columns = { count, lefts, bounds };

  const placed = rowCells.map((cells) => placeCells(cells, cols));
  // The table's line spacings, measured only below a line with text in two or
  // more columns — a table line. A title or caption above the table is one
  // cell, so its distance cannot pass for a "row break" and make evenly
  // spaced rows look like wrapped cells (they would all merge into one row).
  const filledCount = (i: number) => placed[i]?.filter(Boolean).length ?? 0;
  const pitches: number[] = [];
  for (let i = 1; i < rows.length; i++) {
    if (placed[i] && filledCount(i - 1) >= MIN_COLUMNS) pitches.push(centerY(rows[i]) - centerY(rows[i - 1]));
  }
  const tightest = pitches.length ? Math.min(...pitches) : 0;
  // Continuations exist only when the table has TWO spacings (inside a cell,
  // between rows). Evenly spaced lines are one row each — otherwise every line
  // would sit "within reach" of the tightest spacing and merge into one row.
  const hasRowBreaks = pitches.some((p) => p > CONTINUATION_PITCH * tightest);

  // Walk the lines, building runs of logical rows (each a list of line indexes).
  type Run = { lines: number[][] };
  let best: Run | null = null;
  let run: Run | null = null;
  const close = () => {
    if (run && (!best || run.lines.length > best.lines.length)) best = run;
    run = null;
  };
  placed.forEach((cells, i) => {
    const filled = cells ? cells.filter(Boolean).length : 0;
    if (!cells) return close();
    const continues =
      hasRowBreaks &&
      run !== null &&
      i > 0 && placed[i - 1] !== null && centerY(rows[i]) - centerY(rows[i - 1]) <= CONTINUATION_PITCH * tightest;
    if (continues && run) {
      run.lines[run.lines.length - 1].push(i);
      return;
    }
    if (filled < MIN_COLUMNS) return close(); // a new row needs text in two columns
    if (!run || i === 0 || placed[i - 1] === null) {
      close();
      run = { lines: [] };
    }
    run.lines.push([i]);
  });
  close();
  const table = best as Run | null;
  if (!table || table.lines.length < MIN_TABLE_ROWS) return null;

  // Merge each logical row's lines column by column.
  const grid: string[][] = table.lines.map((lineIndexes) =>
    Array.from({ length: count }, (_, j) =>
      lineIndexes.reduce((acc, li) => {
        const cell = placed[li]?.[j];
        return cell ? joinCellLines(acc, textOf(cell)) : acc;
      }, ""),
    ),
  );

  // Guard: prose columns. Short cells, or a short header row.
  const wordCount = (s: string) => (s ? s.split(" ").length : 0);
  const shortCells = median(grid.flat().filter(Boolean).map(wordCount)) <= MAX_WORDS_PER_CELL;
  const header = grid[0].filter(Boolean);
  const headerLike = header.length >= MIN_COLUMNS && header.every((c) => wordCount(c) <= HEADER_MAX_WORDS);
  if (!shortCells && !headerLike) return null;

  // Guard: drop icon/bullet columns (low-confidence glyphs).
  const tableLines = table.lines.flat();
  const keep = Array.from({ length: count }, (_, j) => {
    const confidences = tableLines.flatMap((li) => placed[li]?.[j]?.words.map((w) => w.confidence ?? 100) ?? []);
    if (confidences.length === 0) return false;
    return confidences.reduce((a, b) => a + b, 0) / confidences.length >= ICON_COLUMN_CONFIDENCE;
  });
  const kept = keep.filter(Boolean).length;
  if (kept < MIN_COLUMNS) return null;

  const markdownRow = (row: string[]) => `| ${row.filter((_, j) => keep[j]).map((c) => c.replace(/\|/g, "\\|")).join(" | ")} |`;
  const markdown = [markdownRow(grid[0]), `|${" --- |".repeat(kept)}`, ...grid.slice(1).map(markdownRow)].join("\n");

  const first = Math.min(...tableLines);
  const last = Math.max(...tableLines);
  const before = rowsToText(rows.slice(0, first));
  const after = rowsToText(rows.slice(last + 1));
  return [before, markdown, after].filter(Boolean).join("\n\n");
}
