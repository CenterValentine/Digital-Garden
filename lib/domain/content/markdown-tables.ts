/**
 * GFM table-block recognition (shared by paste detection and decompression)
 *
 * A markdown table is the one construct where a line's meaning depends on its
 * NEIGHBOURS: `| 1. a 2. b |` is a table row, not an ordered list, and only the
 * delimiter row underneath the header says so. Both the paste heuristic (should
 * we offer to convert this?) and the decompressor (which lines may I rewrite?)
 * need that answer, so it lives here rather than being re-guessed in each.
 *
 * Recognition follows GFM: a delimiter row of `-`/`:` cells directly under a
 * header row, with the outer pipes optional on both.
 */

/**
 * A GFM delimiter row — `| --- | --- |`, `--- | ---`, `|:--|--:|`.
 *
 * Requires at least one `|`: a bare `---` is a thematic break or a setext
 * heading underline, and GFM agrees (a one-cell delimiter can't match a
 * multi-column header, so no real table is lost by the requirement).
 */
export function isTableDelimiterRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return false;
  return /^\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?$/.test(trimmed);
}

/**
 * Per-line "this belongs to a table" flags for `lines`.
 *
 * A table block is a header row, the delimiter row under it, and every
 * following non-blank line that still contains a pipe. Callers use it to leave
 * table rows alone — rewriting one silently destroys the grid.
 */
export function tableLineFlags(lines: string[]): boolean[] {
  const flags: boolean[] = new Array(lines.length).fill(false);

  for (let i = 1; i < lines.length; i++) {
    if (!isTableDelimiterRow(lines[i])) continue;
    const header = lines[i - 1];
    if (!header.trim() || !header.includes("|")) continue;

    flags[i - 1] = true;
    flags[i] = true;
    for (let body = i + 1; body < lines.length; body++) {
      if (!lines[body].trim() || !lines[body].includes("|")) break;
      flags[body] = true;
    }
  }

  return flags;
}

/** Does `text` contain at least one GFM table block? */
export function containsTable(text: string): boolean {
  return tableLineFlags(text.split("\n")).some(Boolean);
}
