/**
 * Database CSV export (plan Phase 7 / B6, O6 taken: real export, not a
 * stub — it reuses the loaders and serializers every other surface uses,
 * so it is genuinely about an hour of glue).
 *
 * One CSV of the DEFAULT view's ordering, plus a `.meta.json` sidecar
 * reserving the round-trip shape (column types, configs, relation
 * targets). Hydrated read-model makes the "lossy" columns better than
 * empty: relations export as linked-row titles, person as display name,
 * contentLink/file as node titles, lookup/rollup as their computed
 * values — all documented in the sidecar as display-lossy (titles, not
 * ids), which is what makes re-import a later project, not a surprise.
 *
 * SERVER-ONLY (Prisma via the loaders).
 */

import {
  loadRowPage,
  loadTable,
  resolveView,
} from "@/lib/domain/data/server/queries";
import {
  buildQueryColumns,
  loadQueryRows,
} from "@/lib/domain/data/server/query-mode";
import {
  canRead,
  resolveDataTableAccess,
} from "@/lib/domain/data/server/access";
import {
  cellToText,
  type DataColumn,
  type DataRow,
} from "@/lib/domain/data";

/** Design-scale ceiling (plan D1: ≤10k rows per table). */
const EXPORT_ROW_CAP = 10_000;

/** Column types whose CSV value comes from hydrated read-model, not data. */
const DISPLAY_LOSSY = new Set([
  "relation",
  "lookup",
  "rollup",
  "contentLink",
  "person",
  "file",
]);

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function cellCsvValue(row: DataRow, column: DataColumn): string {
  switch (column.type) {
    case "relation":
      return (row.links?.[column.id] ?? [])
        .map((l) => (l.restricted ? "" : l.title))
        .filter(Boolean)
        .join("; ");
    case "contentLink":
    case "file":
      return (row.contentRefs?.[column.id] ?? [])
        .map((r) => (r.restricted ? "" : r.title))
        .filter(Boolean)
        .join("; ");
    case "person": {
      const ref = row.personRefs?.[column.id];
      return ref && !ref.restricted ? ref.name : "";
    }
    case "lookup":
    case "rollup": {
      const v = row.derived?.[column.id];
      return v === undefined ? "" : String(v);
    }
    default:
      return cellToText(column, row.data[column.key]);
  }
}

export interface DatabaseCsvExport {
  title: string;
  csv: string;
  meta: Record<string, unknown>;
  rowCount: number;
}

export async function exportDatabaseCsv(
  tableId: string,
  ownerId: string,
  viewerId: string
): Promise<DatabaseCsvExport | null> {
  const level = await resolveDataTableAccess(tableId, viewerId);
  if (!canRead(level)) return null;
  const table = await loadTable(tableId, viewerId);
  if (!table) return null;

  let columns: DataColumn[];
  let rows: DataRow[];
  if (table.mode === "query") {
    columns = buildQueryColumns();
    rows = table.query
      ? await loadQueryRows(ownerId, viewerId, table.query, EXPORT_ROW_CAP)
      : [];
  } else {
    // loadTable already orders by the fractional position key.
    columns = table.columns.filter((c) => !c.deletedAt);
    const page = await loadRowPage({
      tableId,
      view: resolveView(table, null),
      columns,
      limit: EXPORT_ROW_CAP,
      viewerId,
    });
    rows = page.rows;
  }

  const header = columns.map((c) => csvEscape(c.name)).join(",");
  const lines = rows.map((row) =>
    columns.map((c) => csvEscape(cellCsvValue(row, c))).join(",")
  );
  const csv = [header, ...lines].join("\r\n") + "\r\n";

  const meta: Record<string, unknown> = {
    format: "dg-database-meta@1",
    exportedAt: new Date().toISOString(),
    table: { id: table.contentId, title: table.title, mode: table.mode },
    rowCount: rows.length,
    columns: columns.map((c) => ({
      id: c.id,
      key: c.key,
      name: c.name,
      type: c.type,
      position: c.position,
      isPrimary: c.isPrimary,
      config: c.config,
      description: c.description,
    })),
    // Round-trip honesty: these columns export their DISPLAY (titles,
    // names, computed values), not the stored ids/links. A future importer
    // must rebuild them from the configs above, not from the CSV cells.
    displayLossyColumns: columns
      .filter((c) => DISPLAY_LOSSY.has(c.type))
      .map((c) => c.name),
    relationTargets: Object.fromEntries(
      columns
        .filter((c) => c.type === "relation" && c.config.relationTableId)
        .map((c) => [c.name, c.config.relationTableId as string])
    ),
  };

  return { title: table.title, csv, meta, rowCount: rows.length };
}
