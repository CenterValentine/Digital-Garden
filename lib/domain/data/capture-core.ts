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

import { encodeCell, isEncodeError } from "./cells";
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
  if (column.type === "multiSelect" && Array.isArray(value)) {
    return value.map(toId);
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
  if (column.type === "relation") {
    return `${column.name} is a relation — links change through the table UI, not cell writes (not supported by this tool yet).`;
  }
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
   * P3 `source: "database-rows"`: item keys ARE row ids of this table —
   * capture writes stamp back to the row by id (update-only, never create)
   * instead of upserting by the dedupe identity.
   */
  rowKeyed?: boolean;
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
    const blocked = writeBlockReason(column);
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
