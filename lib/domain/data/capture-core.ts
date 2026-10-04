/**
 * Pure capture core — no Prisma, no server-only. Two audiences:
 *
 *  - lib/domain/data/server/{resolve,capture}.ts build the I/O paths on it
 *    (resolve.ts re-exports the column helpers so its import surface is
 *    unchanged);
 *  - scripts/validate-capture.ts unit-tests the P2 guarantee here: a
 *    rejected cell yields ZERO writes — testable without a database
 *    precisely because this module is pure.
 *
 * Moved verbatim from server/resolve.ts (helpers) and server/capture.ts
 * (preparation) in the P1/P2 build; behavior unchanged.
 */

import { encodeCell, isEncodeError, splitDelimited } from "./cells";
import type { DataColumn } from "./types";

// ── Column helpers (moved from server/resolve.ts) ─────────────────────────

/** Column lookup by name (case-insensitive), key, or id. */
export function findColumn(
  columns: DataColumn[],
  ref: string
): DataColumn | undefined {
  const lower = ref.trim().toLowerCase();
  return (
    columns.find((c) => c.id === ref || c.key === ref) ??
    columns.find((c) => c.name.toLowerCase() === lower)
  );
}

/**
 * Model ergonomics: select/status cells store option IDS (plan D3), but a
 * model naturally speaks in labels. Accept either; translate labels to ids
 * before the strict encoder sees them.
 */
export function translateOptionValue(
  column: DataColumn,
  value: unknown
): unknown {
  const options = column.config.options ?? [];
  const toId = (v: unknown): unknown => {
    if (typeof v !== "string") return v;
    if (options.some((o) => o.id === v)) return v;
    const byLabel = options.find(
      (o) => o.label.toLowerCase() === v.trim().toLowerCase()
    );
    return byLabel ? byLabel.id : v;
  };
  if (column.type === "select" || column.type === "status") return toId(value);
  if (column.type === "multiSelect") {
    // A delimited STRING is the shallow-list input (config.splitOn): split
    // it here, before the encoder, which is array-only by design. Without
    // this a comma string falls straight through and dies as "Expected a
    // list of options", which is true but useless.
    const list =
      typeof value === "string" && column.config.splitOn
        ? splitDelimited(value, column.config.splitOn)
        : value;
    if (Array.isArray(list)) return list.map(toId);
    return list;
  }
  return value;
}

/**
 * Normalization safety (owner-requested, 2026-08-28): the strict encoder
 * REJECTS type violations by design (plan B8c — never coerce), but a model
 * legitimately produces unambiguous near-misses. Normalize exactly those,
 * nothing else, BEFORE the encoder:
 *  - strings trimmed;
 *  - number columns: a purely numeric string becomes a number;
 *  - checkbox columns: "true"/"yes"/"false"/"no" strings become booleans;
 *  - date columns: M/D/YYYY becomes ISO YYYY-MM-DD (ISO passes through).
 * Anything still ambiguous falls to the encoder and fails loudly — a
 * normalization that guesses is worse than a rejection that teaches.
 */
export function normalizeCellInput(column: DataColumn, raw: unknown): unknown {
  let value = raw;
  if (typeof value === "string") value = value.trim();
  // One value for a LIST column is unambiguous (ITERATION-RUN-HARNESS-FIXES
  // P5, prod 2026-09-27: `Resumes: "<docx id>"` on a file column died as
  // "Expected a list" and cost a step). Ids may arrive as a comma/space
  // list; an option label wraps as-is (translateOptionValue maps it).
  if (
    (column.type === "file" || column.type === "contentLink") &&
    typeof value === "string" &&
    value !== ""
  ) {
    value = value.split(/[\s,]+/).filter((s) => s.length > 0);
  }
  if (
    column.type === "multiSelect" &&
    typeof value === "string" &&
    value !== "" &&
    !column.config.splitOn
  ) {
    value = [value];
  }
  if (column.type === "number" && typeof value === "string" && value !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) value = n;
  }
  if (column.type === "checkbox" && typeof value === "string") {
    const v = value.toLowerCase();
    if (v === "true" || v === "yes") value = true;
    else if (v === "false" || v === "no") value = false;
  }
  if (column.type === "date" && typeof value === "string") {
    const us = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (us) {
      value = `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
    }
  }
  return translateOptionValue(column, value);
}

/** Cells no write tool may target, with the reason the model needs. */
export function writeBlockReason(column: DataColumn): string | null {
  // `relation` is deliberately NOT here any more (plan
  // AI-RELATIONAL-DATABASE-REACH P4). A relation cell's value is its set of
  // links, so the write tools accept it like any other cell and hand it to
  // resolveRelationCell / writeRelationLinks. Backlinks and target-less
  // relations are still refused — by `relationWriteBlock`, which knows why.
  if (column.type === "lookup" || column.type === "rollup") {
    return `${column.name} is computed from a relation — it has no stored value to write.`;
  }
  return null;
}

// ── Capture config (EXTRACTION-TO-DATABASE-PLAN P1/P2) ────────────────────

/**
 * The run's durable capture configuration — stamped into the run ledger's
 * metadata at proposal approval; `record_item_result` re-derives it from
 * there (the ledger is the run's reload-surviving state, never model memory).
 */
export interface CaptureConfig {
  tableId: string;
  tableTitle: string;
  admission: "all" | "qualified" | "custom";
  admissionNote?: string;
  /** Resolved capture columns — name is what the model speaks, key is storage. */
  columns: Array<{ key: string; name: string; type: string }>;
  dedupeColumnKey?: string;
  dedupeColumnName?: string;
  /**
   * Capture columns written by MERGE (cell-merge.ts) rather than replace —
   * alias/keyword columns that accumulate across runs. Names, as the model
   * speaks them; resolved against `columns` at write time.
   */
  mergeColumns?: string[];
  /**
   * P3 `source: "database-rows"`: item keys ARE row ids of this table —
   * capture writes stamp back to the row by id (update-only, never create)
   * instead of upserting by the dedupe identity.
   */
  rowKeyed?: boolean;
  /**
   * ISO stamp of the proposal approval (ITERATION-RUN-HARNESS-FIXES P3).
   * A capture onto a row that was already written AFTER this moment keeps
   * every non-empty cell — the fuller first write (update_row, or the user
   * in the grid) is never clobbered by the item's closing record. Prod
   * 2026-09-27: update_row wrote nine cells, then record_item_result's
   * capture.cells rewrote eight of them shorter, and the short ones won.
   */
  approvedAt?: string;
}

/**
 * Split a capture's prepared writes into the ones that land and the ones
 * KEPT because the row was already written this sitting (P3). Pure, so the
 * gate can pin it: `keepFilledSince` undefined, or the row untouched since
 * then → everything lands; otherwise a write onto a NON-EMPTY current cell
 * is kept (its column key is reported) and only empty cells are filled.
 */
export function partitionCaptureWrites(input: {
  writes: Array<{ columnKey: string; value: unknown }>;
  current: Record<string, unknown>;
  rowUpdatedAt: Date | string | null | undefined;
  keepFilledSince: Date | string | null | undefined;
}): { writes: Array<{ columnKey: string; value: unknown }>; kept: string[] } {
  const since = input.keepFilledSince ? new Date(input.keepFilledSince) : null;
  const updated = input.rowUpdatedAt ? new Date(input.rowUpdatedAt) : null;
  if (
    !since ||
    !updated ||
    Number.isNaN(since.getTime()) ||
    Number.isNaN(updated.getTime()) ||
    updated.getTime() < since.getTime()
  ) {
    return { writes: input.writes, kept: [] };
  }
  const isFilled = (v: unknown): boolean =>
    v !== undefined &&
    v !== null &&
    v !== "" &&
    !(Array.isArray(v) && v.length === 0);
  const writes: Array<{ columnKey: string; value: unknown }> = [];
  const kept: string[] = [];
  for (const w of input.writes) {
    if (isFilled(input.current[w.columnKey])) kept.push(w.columnKey);
    else writes.push(w);
  }
  return { writes, kept };
}

export function parseCaptureConfig(value: unknown): CaptureConfig | null {
  if (!value || typeof value !== "object") return null;
  const c = value as Record<string, unknown>;
  if (typeof c.tableId !== "string" || !Array.isArray(c.columns)) return null;
  if (
    c.admission !== "all" &&
    c.admission !== "qualified" &&
    c.admission !== "custom"
  ) {
    return null;
  }
  return value as unknown as CaptureConfig;
}

// ── Cell preparation (the P2 zero-rows-on-rejection guarantee) ────────────

/**
 * Flat result shape — this tsconfig is not strict, so discriminated unions
 * don't narrow (recorded repo convention: flat optional fields instead).
 * `writes` is EMPTY whenever `ok` is false: the zero-rows guarantee is a
 * property of the value itself, not just of callers reading `ok`.
 */
export interface PreparedCaptureResult {
  ok: boolean;
  writes: Array<{ columnKey: string; value: unknown }>;
  errors?: string[];
}

/**
 * Resolve + normalize + encoder-validate EVERY cell of one item's row.
 * Pure over the column list — no I/O — so the zero-rows-on-rejection
 * guarantee is testable without a database. Any error rejects the whole
 * row; empty values are dropped (empty-is-absent, plan B8c).
 */
export function prepareCaptureCells(
  liveColumns: DataColumn[],
  cells: Record<string, unknown>,
): PreparedCaptureResult {
  const writes: Array<{ columnKey: string; value: unknown }> = [];
  const errors: string[] = [];

  for (const [ref, raw] of Object.entries(cells)) {
    const column = findColumn(liveColumns, ref);
    if (!column) {
      errors.push(
        `No column named "${ref}". Columns: ${liveColumns.map((c) => c.name).join(", ")}.`,
      );
      continue;
    }
    // Capture writes cells, never links (see the note in writeBlockReason).
    const blocked =
      column.type === "relation"
        ? `${column.name} is a relation — a capture run cannot fill links. Capture the target's name into a text column, or link the rows afterwards with update_row.`
        : writeBlockReason(column);
    if (blocked) {
      errors.push(blocked);
      continue;
    }
    const value =
      raw === null || raw === "" ? undefined : normalizeCellInput(column, raw);
    const encoded = encodeCell(column, value);
    if (isEncodeError(encoded)) {
      errors.push(`${column.name}: ${encoded.error}`);
      continue;
    }
    if (encoded.value === undefined) continue; // empty — nothing to write
    writes.push({ columnKey: column.key, value });
  }

  if (errors.length > 0) return { ok: false, writes: [], errors };
  return { ok: true, writes };
}
