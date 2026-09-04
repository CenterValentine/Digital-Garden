/**
 * Iteration capture — the P1/P2 write path of EXTRACTION-TO-DATABASE-PLAN.
 *
 * Lets the per-item iteration loop land admitted items as database rows.
 * Three deliberate divergences from `insert_rows` v1 (its documented flaws):
 *
 *  1. VALIDATE-ALL-BEFORE-ANY-WRITE: every cell of a row is normalized AND
 *     encoder-checked before `createRows` runs. A bad cell yields ZERO new
 *     rows — never a row with a silent blank (the partial-row trap).
 *  2. UPSERT by a dedupe identity (url-tier item key): a re-run or later
 *     sitting UPDATES the existing row instead of duplicating it.
 *  3. No conversation-association gate here: the `propose_item_iteration`
 *     approval card names the target database, and approving it IS the
 *     consent moment — the caller grants the ConversationAssociation there.
 *     Ownership/grant access (`canWrite`) is still enforced on every call.
 *
 * Server-only (Prisma). The AI layer passes ids; this module owns the writes.
 */

import "server-only";
import { prisma } from "@/lib/database/client";
import {
  canWrite,
  resolveDataTableAccess,
} from "@/lib/domain/data/server/access";
import { loadTable } from "@/lib/domain/data/server/queries";
import {
  createRows,
  softDeleteRows,
  writeCells,
  type CellWrite,
} from "@/lib/domain/data/server/mutations";
import {
  resolveDatabaseRef,
  type DataToolContext,
} from "@/lib/domain/data/server/resolve";
import {
  findColumn,
  prepareCaptureCells,
  writeBlockReason,
  type CaptureConfig,
} from "@/lib/domain/data/capture-core";
import {
  deriveRowTitle,
  type DataColumn,
  type RowData,
} from "@/lib/domain/data";

// Pure halves live in capture-core.ts (unit-tested by
// scripts/validate-capture.ts without Prisma); re-exported so the AI layer
// imports everything capture-related from this one module.
export {
  parseCaptureConfig,
  prepareCaptureCells,
} from "@/lib/domain/data/capture-core";
export type { CaptureConfig } from "@/lib/domain/data/capture-core";

// ── Preflight (P1) ────────────────────────────────────────────────────────

export interface CapturePreflightInput {
  ctx: DataToolContext;
  /** Database id or exact name, as the model supplied it. */
  database: string;
  admission: CaptureConfig["admission"];
  admissionNote?: string;
  /** Column NAMES the run intends to write. */
  columnNames: string[];
  /** Optional dedupe column name; defaults to the first url-type column. */
  dedupeColumnName?: string;
}

/**
 * Flat result (repo convention — non-strict tsconfig, unions don't narrow):
 * `config` is present exactly when `ok` is true; `refusal` when false.
 */
export interface CapturePreflightResult {
  ok: boolean;
  refusal?: string;
  config?: CaptureConfig;
  /** Per select-ish capture column: the exact option labels available. */
  optionVocab: Record<string, string[]>;
  /** Capture columns missing an AI-facing description (capture-quality warning). */
  descriptionsMissing: string[];
  /** Select-like capture columns with ZERO options — every value will reject until a vocabulary exists. */
  emptyVocabColumns: string[];
  /**
   * Lower-cased existing values of the dedupe column — plan-time dedup:
   * the proposer marks already-captured items in the checklist. Internal
   * only; never returned to the model wholesale.
   */
  dedupeValues: Set<string>;
}

/**
 * Code-not-model schema preflight (plan §3.1): every named column must
 * exist and be writable; gaps fail LOUDLY with the available names. Access
 * is ownership/grant (`canWrite`) — deliberately NOT the conversation-
 * association gate, which is granted at approval by the caller.
 */
export async function preflightCapture(
  input: CapturePreflightInput,
): Promise<CapturePreflightResult> {
  const refuse = (refusal: string): CapturePreflightResult => ({
    ok: false,
    refusal,
    optionVocab: {},
    descriptionsMissing: [],
    emptyVocabColumns: [],
    dedupeValues: new Set(),
  });

  const dbRef = await resolveDatabaseRef(input.ctx, input.database);
  if ("refusal" in dbRef) return refuse(dbRef.refusal);

  const level = await resolveDataTableAccess(dbRef.id, input.ctx.userId);
  if (!canWrite(level)) {
    return refuse(
      "You have read access to that database but not write — capture needs write access. Tell the user.",
    );
  }
  const table = await loadTable(dbRef.id, input.ctx.userId);
  if (!table) return refuse("Database not found.");
  if (table.mode === "query") {
    return refuse(
      "Query databases project existing notes — they have no rows to capture into. Pick a source-mode database.",
    );
  }

  const live = table.columns.filter((c) => !c.deletedAt);
  const resolved: CaptureConfig["columns"] = [];
  const optionVocab: Record<string, string[]> = {};
  const descriptionsMissing: string[] = [];
  const emptyVocabColumns: string[] = [];

  for (const name of input.columnNames) {
    const column = findColumn(live, name);
    if (!column) {
      return refuse(
        `No column named "${name}" in "${table.title}". Columns here: ${live
          .map((c) => c.name)
          .join(", ")}. Fix the captureTo columns and re-propose.`,
      );
    }
    const blocked = writeBlockReason(column);
    if (blocked) {
      return refuse(
        `${blocked} Remove "${column.name}" from captureTo and re-propose.`,
      );
    }
    resolved.push({ key: column.key, name: column.name, type: column.type });
    if (
      column.type === "select" ||
      column.type === "status" ||
      column.type === "multiSelect"
    ) {
      optionVocab[column.name] = (column.config.options ?? []).map(
        (o) => o.label,
      );
      // Owner smoke 2026-09-02: a select column with ZERO options stalled a
      // run mid-item — every value is "Unknown option" until someone Applies
      // a vocabulary. That's knowable HERE, so say it here.
      if (optionVocab[column.name].length === 0) {
        emptyVocabColumns.push(column.name);
      }
    }
    if (!column.description) descriptionsMissing.push(column.name);
  }

  // Dedupe column: explicit name, else the first url column on the table.
  let dedupeColumn: DataColumn | undefined;
  if (input.dedupeColumnName) {
    dedupeColumn = findColumn(live, input.dedupeColumnName);
    if (!dedupeColumn) {
      return refuse(
        `No column named "${input.dedupeColumnName}" to dedupe by. Columns here: ${live
          .map((c) => c.name)
          .join(", ")}.`,
      );
    }
  } else {
    dedupeColumn = live.find((c) => c.type === "url");
  }

  const dedupeValues = new Set<string>();
  if (dedupeColumn) {
    // Full scan is fine at the table's design scale (plan D1 ≤10k rows).
    const rows = await prisma.dataRow.findMany({
      where: { tableId: dbRef.id, deletedAt: null },
      select: { data: true },
    });
    for (const r of rows) {
      const v = ((r.data ?? {}) as Record<string, unknown>)[dedupeColumn.key];
      if (typeof v === "string" && v) dedupeValues.add(v.trim().toLowerCase());
    }
  }

  return {
    ok: true,
    config: {
      tableId: dbRef.id,
      tableTitle: table.title,
      admission: input.admission,
      ...(input.admissionNote ? { admissionNote: input.admissionNote } : {}),
      columns: resolved,
      ...(dedupeColumn
        ? { dedupeColumnKey: dedupeColumn.key, dedupeColumnName: dedupeColumn.name }
        : {}),
    },
    optionVocab,
    descriptionsMissing,
    emptyVocabColumns,
    dedupeValues,
  };
}

// ── Row enumeration (P3 — `source: "database-rows"`) ──────────────────────

export interface CaptureRowItem {
  rowId: string;
  label: string;
  url?: string;
}

/**
 * Enumerate a capture table's rows as iteration items: key = row id (the
 * strongest tier — survives everything short of deletion), label = the row's
 * derived title, url = its url-column value when present. `rowIds` narrows
 * AND orders the set (the model picks rows via query_database first);
 * omitted = all live rows in grid order, capped by `limit`.
 *
 * Flat result (non-strict tsconfig — no union narrowing): `items` present
 * on success, `refusal` on failure.
 */
export async function enumerateCaptureRows(input: {
  userId: string;
  config: CaptureConfig;
  rowIds?: string[];
  limit: number;
}): Promise<{ items?: CaptureRowItem[]; refusal?: string }> {
  const { userId, config } = input;
  const table = await loadTable(config.tableId, userId);
  if (!table) return { refusal: "Database not found." };
  const live = table.columns.filter((c) => !c.deletedAt);
  const urlColumn =
    live.find((c) => c.key === config.dedupeColumnKey && c.type === "url") ??
    live.find((c) => c.type === "url");

  const rows = await prisma.dataRow.findMany({
    where: {
      tableId: config.tableId,
      deletedAt: null,
      ...(input.rowIds && input.rowIds.length > 0
        ? { id: { in: input.rowIds } }
        : {}),
    },
    orderBy: { sortKey: "asc" },
    take: Math.max(1, Math.min(input.limit, 250)),
    select: { id: true, data: true },
  });
  if (rows.length === 0) {
    return {
      refusal:
        input.rowIds && input.rowIds.length > 0
          ? "None of the given rowIds exist (live) in that database — re-check them with query_database and re-propose."
          : `"${config.tableTitle}" has no rows to iterate.`,
    };
  }
  // Preserve the model's explicit order when rowIds were given.
  const ordered =
    input.rowIds && input.rowIds.length > 0
      ? input.rowIds
          .map((id) => rows.find((r) => r.id === id))
          .filter((r): r is (typeof rows)[number] => Boolean(r))
      : rows;
  return {
    items: ordered.map((r) => {
      const data = (r.data ?? {}) as Record<string, unknown>;
      const url = urlColumn ? data[urlColumn.key] : undefined;
      return {
        rowId: r.id,
        label: deriveRowTitle(live, data as RowData),
        ...(typeof url === "string" && url ? { url } : {}),
      };
    }),
  };
}

// ── Upsert (P2) ───────────────────────────────────────────────────────────

export interface CaptureUpsertResult {
  status: "created" | "updated" | "rejected";
  rowId?: string;
  errors?: string[];
}

/**
 * Land one admitted item as a row: validate ALL cells first, then update
 * the row holding the dedupe identity if one exists, else create. A
 * validation failure writes NOTHING.
 */
export async function captureUpsertRow(input: {
  userId: string;
  config: CaptureConfig;
  /** Column NAME → value, as the model supplied them. */
  cells: Record<string, unknown>;
  /** The item's stable identity (its url-tier key), for the dedupe column. */
  dedupeValue?: string;
  /**
   * Row-keyed stamp-back (P3 `database-rows`): the item's key IS this row —
   * update it in place. Update-only: a vanished row rejects, never re-creates
   * (creating would fork the identity the run enumerated from).
   */
  rowId?: string;
}): Promise<CaptureUpsertResult> {
  const { userId, config } = input;

  const level = await resolveDataTableAccess(config.tableId, userId);
  if (!canWrite(level)) {
    return { status: "rejected", errors: ["Write access to the database was revoked."] };
  }
  const table = await loadTable(config.tableId, userId);
  if (!table) return { status: "rejected", errors: ["Database not found."] };
  const live = table.columns.filter((c) => !c.deletedAt);

  // Ensure the dedupe identity itself lands in its column even when the
  // model omitted it from cells.
  const cells = { ...input.cells };
  const dedupeValue = input.dedupeValue?.trim();
  if (config.dedupeColumnName && dedupeValue) {
    const present = Object.keys(cells).some(
      (k) => findColumn(live, k)?.key === config.dedupeColumnKey,
    );
    if (!present) cells[config.dedupeColumnName] = dedupeValue;
  }

  const prepared = prepareCaptureCells(live, cells);
  if (!prepared.ok) {
    return { status: "rejected", errors: prepared.errors ?? [] };
  }
  if (prepared.writes.length === 0) {
    // All cells normalized to empty — creating a `{}` row would be exactly
    // the silent-blank artifact this path exists to prevent (owner smoke
    // found three grid-seeded empty rows; the capture path must never add
    // a fourth).
    return {
      status: "rejected",
      errors: [
        "Every cell was empty after normalization — a captured row needs at least one real value. Include the item's actual data in capture.cells.",
      ],
    };
  }

  let existingRowId: string | undefined;
  if (input.rowId) {
    // Row-keyed: verify the row is still live, then update in place.
    const row = await prisma.dataRow.findFirst({
      where: { id: input.rowId, tableId: config.tableId, deletedAt: null },
      select: { id: true },
    });
    if (!row) {
      return {
        status: "rejected",
        errors: [
          `Row ${input.rowId} no longer exists in "${config.tableTitle}" — it may have been deleted since the run was proposed. Record the item without capture.cells and move on.`,
        ],
      };
    }
    existingRowId = row.id;
  } else if (config.dedupeColumnKey && dedupeValue) {
    // Dedupe lookup: exact JSON match on the stored (trimmed) value.
    const existing = await prisma.dataRow.findFirst({
      where: {
        tableId: config.tableId,
        deletedAt: null,
        data: { path: [config.dedupeColumnKey], equals: dedupeValue },
      },
      select: { id: true },
    });
    existingRowId = existing?.id;
  }

  if (existingRowId) {
    const writes: CellWrite[] = prepared.writes.map((w) => ({
      rowId: existingRowId,
      columnKey: w.columnKey,
      value: w.value as CellWrite["value"],
    }));
    const result = await writeCells(config.tableId, live, writes);
    if (!result.ok) {
      return {
        status: "rejected",
        errors: result.results
          .filter((r) => r.status === "error")
          .map((r) => (r.status === "error" ? r.message : "")),
      };
    }
    return { status: "updated", rowId: existingRowId };
  }

  const [rowId] = await createRows(config.tableId, live, 1, userId);
  const writes: CellWrite[] = prepared.writes.map((w) => ({
    rowId,
    columnKey: w.columnKey,
    value: w.value as CellWrite["value"],
  }));
  const result = await writeCells(config.tableId, live, writes);
  if (!result.ok) {
    // Belt-and-braces: pre-validation makes this near-impossible, but if the
    // batch write refuses, take the fresh empty row back out — the guarantee
    // is "a row lands whole or not at all".
    await softDeleteRows(config.tableId, [rowId], userId).catch(() => null);
    return {
      status: "rejected",
      errors: result.results
        .filter((r) => r.status === "error")
        .map((r) => (r.status === "error" ? r.message : "")),
    };
  }
  return { status: "created", rowId };
}
