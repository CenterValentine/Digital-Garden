/**
 * Row suggestions — the shared resolver behind lazy promotion (plan Phase 5).
 *
 * Wiki-link `[[...]]` autocomplete and chat `@`-mentions both offer
 * UN-promoted rows as a second suggestion source beside notes; picking one
 * promotes it to a ContentNode at role "referenced" (the incidental path —
 * the deliberate open-as-page path writes "primary"). This module is the
 * single search implementation both callers hit, so what a row "looks like"
 * in a suggestion list cannot fork between the editor and the chat.
 *
 * Only rows with NO content node are returned: a promoted row already
 * surfaces in the ordinary note search under its title-synced node, and
 * listing it here too would duplicate every hit.
 *
 * Scope is owner-only, matching the global search route's database branch
 * (plan B2). Shared tables (additive grants, plan B3) are deliberately not
 * searched — showing fewer suggestions is the safe direction to fail in.
 *
 * SERVER-ONLY (Prisma).
 */

import { prisma } from "@/lib/database/client";
import {
  deriveRowTitle,
  type DataColumn,
  type DataColumnConfig,
  type RowData,
} from "@/lib/domain/data";

export interface RowSuggestion {
  rowId: string;
  tableId: string;
  /** The table's node title — the badge that tells the user which database. */
  tableTitle: string;
  /** Primary-column value ("Untitled" when empty — honest, like the peek). */
  title: string;
}

export async function searchRowSuggestions(
  viewerId: string,
  query: string,
  limit = 5
): Promise<RowSuggestion[]> {
  const q = query.trim();
  // An empty query lists recent notes in both callers; rows join only once
  // the user is typing a name. `[[` alone flooding the popup with rows from
  // every table would bury the notes the trigger is usually for.
  if (!q) return [];

  const rows = await prisma.dataRow.findMany({
    where: {
      deletedAt: null,
      contentId: null,
      searchText: { contains: q, mode: "insensitive" },
      table: {
        // Query-table rows project nodes that exist already — nothing to
        // promote, and their nodes are found by the note search directly.
        mode: "table",
        content: { ownerId: viewerId, deletedAt: null },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: { id: true, tableId: true, data: true },
  });
  if (rows.length === 0) return [];

  const tableIds = [...new Set(rows.map((r) => r.tableId))];
  const [rawColumns, tables] = await Promise.all([
    prisma.dataColumn.findMany({
      where: { tableId: { in: tableIds }, deletedAt: null },
      orderBy: { position: "asc" },
    }),
    prisma.contentNode.findMany({
      where: { id: { in: tableIds } },
      select: { id: true, title: true },
    }),
  ]);

  const columnsByTable = new Map<string, DataColumn[]>();
  for (const c of rawColumns) {
    const list = columnsByTable.get(c.tableId) ?? [];
    list.push({
      id: c.id,
      key: c.key,
      name: c.name,
      type: c.type,
      position: c.position,
      isPrimary: c.isPrimary,
      config: (c.config ?? {}) as unknown as DataColumnConfig,
      description: c.description,
      deletedAt: null,
    });
    columnsByTable.set(c.tableId, list);
  }
  const titleByTable = new Map(tables.map((t) => [t.id, t.title]));

  return rows.map((row) => ({
    rowId: row.id,
    tableId: row.tableId,
    tableTitle: titleByTable.get(row.tableId) ?? "Database",
    title: deriveRowTitle(
      columnsByTable.get(row.tableId) ?? [],
      (row.data ?? {}) as RowData
    ),
  }));
}
