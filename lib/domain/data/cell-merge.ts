/**
 * Cell MERGE — union for list columns, token-append for text — PURE.
 *
 * Why (owner scenario, 2026-09-21): an "Aliases and Job Wording" column is
 * meant to ACCUMULATE employer phrasing across runs so canonical rows never
 * get recreated. Every write path replaced a cell wholesale; `expect` stops a
 * STALE write but not a forgetful one, and the capture path has no read step
 * at all — so a second run writing "Revenue Ops" erased the first run's "GTM".
 *
 * Merge is computed against the row AS IT IS inside `writeCells`'s
 * transaction, so no read step, no race between two AIs, and it is
 * idempotent: merging a value that is already present changes nothing.
 *
 *   list (multiSelect):   current ∪ incoming, by option id
 *   text / longText:      current + tokens of incoming not already present,
 *                         split on , ; or newline, matched case-insensitively,
 *                         joined with the delimiter the cell already uses
 *   anything else:        refused — merge has no meaning for a date or a number
 */

import type { DataColumn } from "./types";

export type MergeResult = { value: unknown } | { error: string };

const TOKEN_SPLIT = /[,;\n]/;

function tokens(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter((v) => v.length > 0);
  }
  if (typeof value === "string") {
    return value.split(TOKEN_SPLIT).map((v) => v.trim()).filter((v) => v.length > 0);
  }
  if (value === undefined || value === null) return [];
  return [String(value).trim()].filter((v) => v.length > 0);
}

/** Merge `incoming` into `current` for one column. `incoming` for a list column is already option ids. */
export function mergeCellValue(
  column: Pick<DataColumn, "type" | "name">,
  current: unknown,
  incoming: unknown,
): MergeResult {
  if (column.type === "multiSelect") {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const id of [...tokens(current), ...tokens(incoming)]) {
      const key = id.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(id);
    }
    return { value: out };
  }
  if (column.type === "text" || column.type === "longText") {
    const currentText = typeof current === "string" ? current : "";
    const have = new Set(tokens(currentText).map((t) => t.toLowerCase()));
    const added = tokens(incoming).filter((t) => {
      const key = t.toLowerCase();
      if (have.has(key)) return false;
      have.add(key);
      return true;
    });
    if (added.length === 0) return { value: currentText || undefined };
    if (!currentText.trim()) return { value: added.join(", ") };
    const delimiter = currentText.includes("\n") ? "\n" : ", ";
    return { value: `${currentText.replace(/[\s,;]+$/, "")}${delimiter}${added.join(delimiter)}` };
  }
  return {
    error: `"${column.name}" is a ${column.type} column — merge applies to text, longText and list columns; write it plainly instead.`,
  };
}
