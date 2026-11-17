/**
 * CRM writes — thin wrappers over the database layer's own write path.
 *
 * Nothing here touches DataRow directly. Rows are created with `createRows`,
 * cells written with `writeCells` (the strict encoder, all-or-nothing) and
 * links with `writeRelationLinks` — the same functions the grid's routes
 * call — so search text, row counts, option validation and backlinks behave
 * exactly as if the operator had typed into the database.
 *
 * Callers address columns by ID (the config's bindings) and pass option
 * ids or labels; labels are translated by the same tolerance seam the AI
 * write paths use.
 *
 * SERVER-ONLY (Prisma).
 */

import { prisma } from "@/lib/database/client";
import { createRows, writeCells, type CellWrite } from "@/lib/domain/data/server/mutations";
import { writeRelationLinks } from "@/lib/domain/data/server/relation-cells";
import { normalizeCellInput } from "@/lib/domain/data/capture-core";
import type { DataColumn, DataTable } from "@/lib/domain/data";

export class CrmWriteError extends Error {}

function columnOrThrow(table: DataTable, columnId: string): DataColumn {
  const column = table.columns.find((c) => c.id === columnId);
  if (!column) throw new CrmWriteError(`“${table.title}” is missing a column the CRM is bound to.`);
  return column;
}

/** Cells by column id → CellWrite[] for one row. `undefined` clears. */
function toWrites(
  table: DataTable,
  rowId: string,
  cells: Record<string, unknown>
): CellWrite[] {
  return Object.entries(cells).map(([columnId, value]) => {
    const column = columnOrThrow(table, columnId);
    return {
      rowId,
      columnKey: column.key,
      value: value === undefined ? undefined : normalizeCellInput(column, value),
    };
  });
}

export async function setCells(
  table: DataTable,
  rowId: string,
  cells: Record<string, unknown>
): Promise<void> {
  const writes = toWrites(table, rowId, cells);
  if (writes.length === 0) return;
  const { ok, results } = await writeCells(table.contentId, table.columns, writes);
  if (!ok) {
    const failed = results.find((r) => r.status !== "applied");
    throw new CrmWriteError(
      failed?.status === "error" ? failed.message : "The record changed underneath this write."
    );
  }
}

export async function setLinks(
  table: DataTable,
  rowId: string,
  links: Record<string, string[]>
): Promise<void> {
  for (const [columnId, rowIds] of Object.entries(links)) {
    columnOrThrow(table, columnId);
    await writeRelationLinks(columnId, rowId, rowIds);
  }
}

/**
 * Create one row with its cells and links. Not one transaction (the data
 * layer's functions each own theirs) — a failure after creation leaves a
 * blank-ish row the operator can see and delete, never a hidden half-write.
 */
export async function createRow(
  table: DataTable,
  createdBy: string,
  cells: Record<string, unknown>,
  links: Record<string, string[]> = {}
): Promise<string> {
  const [rowId] = await createRows(table.contentId, table.columns, 1, createdBy);
  await setCells(table, rowId, cells);
  await setLinks(table, rowId, links);
  return rowId;
}

/** Rows whose text cell equals `value` exactly (JSONB containment, GIN-indexed). */
export async function findRowIdsByCell(
  table: DataTable,
  columnId: string,
  value: string
): Promise<string[]> {
  const column = columnOrThrow(table, columnId);
  const rows = await prisma.dataRow.findMany({
    where: {
      tableId: table.contentId,
      deletedAt: null,
      data: { path: [column.key], equals: value },
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** True when the row is a live row of this table — guards ids from the client. */
export async function rowBelongsTo(table: DataTable, rowId: string): Promise<boolean> {
  const row = await prisma.dataRow.findFirst({
    where: { id: rowId, tableId: table.contentId, deletedAt: null },
    select: { id: true },
  });
  return row !== null;
}

/**
 * Serialize work on one key across every server instance for the length of
 * `fn`: a Postgres transaction-scoped advisory lock, held by an otherwise
 * idle transaction while `fn` writes through the normal pool. Concurrent
 * deliveries of the same event queue here instead of both passing the
 * "already applied?" check.
 */
export async function withCrmLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
      return fn();
    },
    { timeout: 30_000, maxWait: 10_000 }
  );
}
