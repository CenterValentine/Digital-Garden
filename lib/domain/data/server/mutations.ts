/**
 * Write paths for the database content type.
 *
 * Everything here is transactional and CAS-aware. The compare-and-swap is not
 * an optimization — it is what makes undo safe under per-cell last-write-wins
 * (plan D5/B4). Without it, undoing your own edit silently overwrites whatever
 * someone else did to that cell in the meantime, and nobody finds out.
 *
 * `rowCount` is maintained inside the same transaction as the row writes, so
 * the header can never disagree with the table.
 *
 * SERVER-ONLY (Prisma).
 */

import { prisma } from "@/lib/database/client";
import type { Prisma } from "@/lib/database/generated/prisma";
import {
  applyCell,
  buildDefaultStatusOptions,
  cellsEqual,
  deriveRowSearchText,
  deriveRowTitle,
  deriveTableSearchText,
  encodeCell,
  isEncodeError,
  generateUniqueColumnKey,
  keyAtEnd,
  keysBetween,
  type CellValue,
  type DataColumn,
  type DataColumnConfig,
  type RowData,
} from "@/lib/domain/data";

// ── Results ──────────────────────────────────────────────────────────────

export type CellWriteResult =
  | { status: "applied"; rowId: string; data: RowData }
  /** The precondition failed. Report; never overwrite (plan B4.2). */
  | { status: "stale"; rowId: string; columnKey: string; current: CellValue | undefined }
  | { status: "error"; rowId: string; message: string };

export interface CellWrite {
  rowId: string;
  columnKey: string;
  /** The value to store. `undefined` clears (deletes the key). */
  value: unknown;
  /**
   * CAS precondition — what the caller believes is there now. Omit for a
   * plain edit; undo ALWAYS supplies it.
   */
  expect?: CellValue | undefined;
  /** Set when `expect` is a meaningful `undefined` rather than "not checking". */
  hasExpectation?: boolean;
}

// ── Cells ────────────────────────────────────────────────────────────────

/**
 * Write cells, optionally under CAS.
 *
 * All-or-nothing per call: a pasted range is one undo entry, so a partially
 * applied paste would leave the stack describing a state that never existed.
 * If any write is stale, none are applied.
 */
export async function writeCells(
  tableId: string,
  columns: DataColumn[],
  writes: CellWrite[]
): Promise<{ ok: boolean; results: CellWriteResult[] }> {
  if (writes.length === 0) return { ok: true, results: [] };

  const byKey = new Map(columns.map((c) => [c.key, c]));
  const rowIds = [...new Set(writes.map((w) => w.rowId))];

  return prisma.$transaction(async (tx) => {
    const rows = await tx.dataRow.findMany({
      where: { id: { in: rowIds }, tableId, deletedAt: null },
      select: { id: true, data: true, contentId: true },
    });
    const rowById = new Map(
      rows.map((r) => [r.id, (r.data ?? {}) as RowData])
    );

    const results: CellWriteResult[] = [];
    const nextByRow = new Map<string, RowData>();

    // Pass 1 — validate and check preconditions. Nothing is written yet.
    for (const write of writes) {
      const column = byKey.get(write.columnKey);
      if (!column) {
        results.push({
          status: "error",
          rowId: write.rowId,
          message: `Unknown column "${write.columnKey}"`,
        });
        continue;
      }

      const current = nextByRow.get(write.rowId) ?? rowById.get(write.rowId);
      if (!current) {
        results.push({
          status: "error",
          rowId: write.rowId,
          message: "Row not found",
        });
        continue;
      }

      if (write.hasExpectation) {
        const actual = current[write.columnKey];
        if (!cellsEqual(actual, write.expect)) {
          results.push({
            status: "stale",
            rowId: write.rowId,
            columnKey: write.columnKey,
            current: actual,
          });
          continue;
        }
      }

      const encoded = encodeCell(column, write.value);
      if (isEncodeError(encoded)) {
        results.push({
          status: "error",
          rowId: write.rowId,
          message: encoded.error,
        });
        continue;
      }

      nextByRow.set(
        write.rowId,
        applyCell(current, write.columnKey, encoded.value)
      );
    }

    // File cells hold UPLOADED ATTACHMENTS — every id must be a file node
    // (owner clarification, 2026-08-31: File = external content brought in;
    // Content Link = references to app content). Enforced HERE so every
    // write path — grid, peek, AI update_row/insert_rows — agrees. Note
    // ids created by AI file tools pass (they ARE file nodes); a note or
    // folder id is a category error. Legacy cells keep displaying; only
    // new writes are held to the contract.
    const fileIdsToCheck = new Set<string>();
    for (const write of writes) {
      if (byKey.get(write.columnKey)?.type !== "file") continue;
      if (!Array.isArray(write.value)) continue;
      for (const id of write.value) {
        if (typeof id === "string") fileIdsToCheck.add(id);
      }
    }
    if (fileIdsToCheck.size > 0) {
      const nodes = await tx.contentNode.findMany({
        where: { id: { in: [...fileIdsToCheck] }, deletedAt: null },
        select: {
          id: true,
          contentType: true,
          title: true,
          filePayload: { select: { mimeType: true } },
        },
      });
      const nodeById = new Map(nodes.map((n) => [n.id, n]));
      for (const write of writes) {
        const column = byKey.get(write.columnKey);
        if (column?.type !== "file") continue;
        if (!Array.isArray(write.value)) continue;
        for (const id of write.value) {
          if (typeof id !== "string") continue;
          const node = nodeById.get(id);
          if (!node || node.contentType !== "file") {
            results.push({
              status: "error",
              rowId: write.rowId,
              message: node
                ? `"${node.title}" is a ${node.contentType}, not an uploaded file — File cells hold uploaded attachments; use a Content Link column for other content`
                : "File cells hold uploaded attachments — one of the ids is not a file in this garden",
            });
            break;
          }
          // Images columns (config.imageOnly): image mime types only.
          if (
            column.config?.imageOnly &&
            !node.filePayload?.mimeType?.startsWith("image/")
          ) {
            results.push({
              status: "error",
              rowId: write.rowId,
              message: `"${node.title}" is not an image — this Images column accepts image files only`,
            });
            break;
          }
        }
      }
    }

    const failed = results.some((r) => r.status !== "applied");
    if (failed) {
      // Abandon the whole batch. Returning without writing is the point.
      return { ok: false, results };
    }

    // Pass 2 — commit.
    const primary = columns.find((c) => c.isPrimary && !c.deletedAt);
    // `file` cells are contentLink-shaped (plan B8b) and want the same
    // backlink dual-write: an attachment IS a reference to that node.
    const contentLinkColumns = columns.filter(
      (c) => (c.type === "contentLink" || c.type === "file") && !c.deletedAt
    );
    for (const [rowId, data] of nextByRow) {
      const row = rows.find((r) => r.id === rowId);
      await tx.dataRow.update({
        where: { id: rowId },
        data: {
          data: data as unknown as Prisma.InputJsonValue,
          searchText: deriveRowSearchText(columns, data),
        },
      });

      // Title sync: the primary column is canonical, and writes through to
      // the promoted node so search, backlinks and the tree agree (plan
      // Phase 5). One direction only — the page header edits the cell.
      if (row?.contentId && primary) {
        await tx.contentNode.update({
          where: { id: row.contentId },
          data: { title: deriveRowTitle(columns, data).slice(0, 255) },
        });
      }

      // Backlinks dual-write (plan Phase 4): a contentLink cell pointing at
      // a node makes the TABLE a backlink source for that node, via a
      // distinct linkType the tree's embed-ownership inference ignores
      // (only image-ref/audio-ref feed it — verified 2026-08-23). Cell is
      // the source of truth; ContentLink rows follow it. Removal only when
      // NO live row in the table still references the target.
      if (contentLinkColumns.length > 0 && row) {
        const before = rowById.get(rowId) ?? {};
        for (const column of contentLinkColumns) {
          const prev = new Set(
            Array.isArray(before[column.key])
              ? (before[column.key] as string[])
              : []
          );
          const next = new Set(
            Array.isArray(data[column.key])
              ? (data[column.key] as string[])
              : []
          );
          for (const targetId of next) {
            if (prev.has(targetId)) continue;
            await tx.contentLink.upsert({
              where: {
                sourceId_targetId_linkType: {
                  sourceId: tableId,
                  targetId,
                  linkType: "data-cell",
                },
              },
              create: { sourceId: tableId, targetId, linkType: "data-cell" },
              update: {},
            });
          }
          for (const targetId of prev) {
            if (next.has(targetId)) continue;
            // A reference may survive through ANY contentLink column —
            // including another column of THIS row's new state — so the
            // existence check spans all of them, not just the edited one.
            const stillInThisRow = contentLinkColumns.some((c) => {
              const cell = data[c.key];
              return Array.isArray(cell) && cell.includes(targetId);
            });
            if (stillInThisRow) continue;
            const stillReferenced = await tx.dataRow.count({
              where: {
                tableId,
                deletedAt: null,
                id: { not: rowId },
                OR: contentLinkColumns.map((c) => ({
                  data: {
                    path: [c.key],
                    array_contains: [
                      targetId,
                    ] as unknown as Prisma.InputJsonValue,
                  },
                })),
              },
            });
            if (stillReferenced === 0) {
              await tx.contentLink.deleteMany({
                where: { sourceId: tableId, targetId, linkType: "data-cell" },
              });
            }
          }
        }
      }

      results.push({ status: "applied", rowId, data });
    }

    return { ok: true, results };
  });
}

// ── Rows ─────────────────────────────────────────────────────────────────

/**
 * Append rows. `rowCount` moves inside the same transaction so the header
 * cannot drift from reality.
 */
export async function createRows(
  tableId: string,
  columns: DataColumn[],
  count: number,
  createdBy: string,
  afterSortKey: string | null = null
): Promise<string[]> {
  if (count <= 0) return [];

  // Column defaults stamped at creation — HERE, so every creation path
  // (grid add-row, board "+ New", forms, AI insert_rows) agrees. A caller
  // that then writes its own value simply overwrites the stamp.
  const defaults: Record<string, boolean> = {};
  for (const column of columns) {
    if (
      !column.deletedAt &&
      column.type === "checkbox" &&
      column.config?.defaultChecked === true
    ) {
      defaults[column.key] = true;
    }
  }

  return prisma.$transaction(async (tx) => {
    const last = afterSortKey
      ? { sortKey: afterSortKey }
      : await tx.dataRow.findFirst({
          where: { tableId, deletedAt: null },
          orderBy: { sortKey: "desc" },
          select: { sortKey: true },
        });

    const keys =
      count === 1
        ? [keyAtEnd(last?.sortKey ?? null)]
        : keysBetween(last?.sortKey ?? null, null, count);

    const ids: string[] = [];
    for (const sortKey of keys) {
      const created = await tx.dataRow.create({
        data: {
          tableId,
          sortKey,
          data: defaults as unknown as Prisma.InputJsonValue,
          searchText: deriveRowSearchText(columns, defaults),
          createdBy,
        },
        select: { id: true },
      });
      ids.push(created.id);
    }

    await tx.dataPayload.update({
      where: { contentId: tableId },
      data: { rowCount: { increment: ids.length } },
    });

    return ids;
  });
}

/**
 * Soft-delete rows, and their promoted nodes with them.
 *
 * Cascade keys off `DataRow`, NOT off `ownedByNoteId` (plan Phase 5): a row
 * page filed elsewhere in the tree has detached its ownership edge, and
 * keying off that edge would let it survive its own table's deletion as an
 * orphan node pointing at nothing.
 */
export async function softDeleteRows(
  tableId: string,
  rowIds: string[],
  deletedBy: string
): Promise<number> {
  if (rowIds.length === 0) return 0;

  return prisma.$transaction(async (tx) => {
    const rows = await tx.dataRow.findMany({
      where: { id: { in: rowIds }, tableId, deletedAt: null },
      select: { id: true, contentId: true },
    });
    if (rows.length === 0) return 0;

    const now = new Date();
    await tx.dataRow.updateMany({
      where: { id: { in: rows.map((r) => r.id) } },
      data: { deletedAt: now },
    });

    const nodeIds = rows
      .map((r) => r.contentId)
      .filter((id): id is string => id !== null);
    if (nodeIds.length > 0) {
      await tx.contentNode.updateMany({
        where: { id: { in: nodeIds }, deletedAt: null },
        data: { deletedAt: now, deletedBy },
      });
    }

    await tx.dataPayload.update({
      where: { contentId: tableId },
      data: { rowCount: { decrement: rows.length } },
    });

    return rows.length;
  });
}

/** Undo of a delete: idempotent, no CAS needed (plan B4.5). */
export async function restoreRows(
  tableId: string,
  rowIds: string[]
): Promise<number> {
  if (rowIds.length === 0) return 0;

  return prisma.$transaction(async (tx) => {
    const rows = await tx.dataRow.findMany({
      where: { id: { in: rowIds }, tableId, deletedAt: { not: null } },
      select: { id: true, contentId: true },
    });
    if (rows.length === 0) return 0;

    await tx.dataRow.updateMany({
      where: { id: { in: rows.map((r) => r.id) } },
      data: { deletedAt: null },
    });

    const nodeIds = rows
      .map((r) => r.contentId)
      .filter((id): id is string => id !== null);
    if (nodeIds.length > 0) {
      await tx.contentNode.updateMany({
        where: { id: { in: nodeIds } },
        data: { deletedAt: null, deletedBy: null },
      });
    }

    await tx.dataPayload.update({
      where: { contentId: tableId },
      data: { rowCount: { increment: rows.length } },
    });

    return rows.length;
  });
}

/** Move one row. Fractional keys mean this rewrites exactly one row (D7). */
export async function moveRow(
  tableId: string,
  rowId: string,
  sortKey: string
): Promise<void> {
  await prisma.dataRow.update({
    where: { id: rowId, tableId },
    data: { sortKey },
  });
}

// ── Columns ──────────────────────────────────────────────────────────────

/**
 * Add a column.
 *
 * The `key` is generated once and is immutable for the column's life — it is
 * the JSONB key, and the display name is free to change without touching a
 * single row (plan D3). `status` columns are seeded with options because a
 * status column with none is useless: a board built on it renders zero groups.
 */
export async function createColumn(
  tableId: string,
  input: {
    name: string;
    type: DataColumn["type"];
    description?: string | null;
    config?: DataColumnConfig;
  }
): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.dataColumn.findMany({
      where: { tableId },
      select: { key: true, position: true },
      orderBy: { position: "desc" },
    });

    const key = generateUniqueColumnKey(existing.map((c) => c.key));
    const position = keyAtEnd(existing[0]?.position ?? null);

    const config: DataColumnConfig =
      input.config ??
      (input.type === "status"
        ? { options: buildDefaultStatusOptions() }
        : {});

    const created = await tx.dataColumn.create({
      data: {
        tableId,
        key,
        name: input.name.slice(0, 255),
        type: input.type,
        position,
        isPrimary: false,
        config: config as unknown as Prisma.InputJsonValue,
        description: input.description?.slice(0, 280) ?? null,
      },
      select: { id: true },
    });

    await refreshTableSearchText(tx, tableId);
    return created.id;
  });
}

/**
 * Create a forward relation column here AND its backlink on the target, as
 * one transaction (plan Phase 4, appendix: symmetry is a property of the
 * columns, not the storage). The backlink is a relation column whose
 * config.symmetricColumnId names the forward column; it owns no links —
 * hydration reads the forward column's links with the direction flipped.
 * The pair cross-references both ways so either side can find its mirror.
 */
export async function createRelationPair(
  tableId: string,
  targetTableId: string,
  input: { name: string; description?: string | null },
  backlinkName: string
): Promise<{ forwardId: string; backlinkId: string }> {
  return prisma.$transaction(async (tx) => {
    const makeColumn = async (
      onTableId: string,
      name: string,
      config: DataColumnConfig,
      description: string | null
    ) => {
      const existing = await tx.dataColumn.findMany({
        where: { tableId: onTableId },
        select: { key: true, position: true },
        orderBy: { position: "desc" },
      });
      return tx.dataColumn.create({
        data: {
          tableId: onTableId,
          key: generateUniqueColumnKey(existing.map((c) => c.key)),
          name: name.slice(0, 255),
          type: "relation",
          position: keyAtEnd(existing[0]?.position ?? null),
          isPrimary: false,
          config: config as unknown as Prisma.InputJsonValue,
          description,
        },
        select: { id: true },
      });
    };

    const forward = await makeColumn(
      tableId,
      input.name,
      { relationTableId: targetTableId },
      input.description?.slice(0, 280) ?? null
    );
    const backlink = await makeColumn(
      targetTableId,
      backlinkName,
      { relationTableId: tableId, symmetricColumnId: forward.id, isBacklink: true },
      null
    );
    await tx.dataColumn.update({
      where: { id: forward.id },
      data: {
        config: {
          relationTableId: targetTableId,
          symmetricColumnId: backlink.id,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    await refreshTableSearchText(tx, tableId);
    await refreshTableSearchText(tx, targetTableId);
    return { forwardId: forward.id, backlinkId: backlink.id };
  });
}

/**
 * Rename a column, or edit its description and config.
 *
 * Note what is NOT here: `type`. Changing a column's type is forbidden
 * (plan O4) — coercing every existing cell is lossy in ways no preview
 * really conveys, and "create a new column and migrate" is both cheaper to
 * build and more honest about what is happening to the data.
 */
export async function updateColumn(
  columnId: string,
  patch: {
    name?: string;
    description?: string | null;
    config?: DataColumnConfig;
    /** Fractional key. A drag rewrites ONE column — the point of D7. */
    position?: string;
  }
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const column = await tx.dataColumn.update({
      where: { id: columnId },
      data: {
        ...(patch.name !== undefined ? { name: patch.name.slice(0, 255) } : {}),
        ...(patch.description !== undefined
          ? { description: patch.description?.slice(0, 280) ?? null }
          : {}),
        ...(patch.config !== undefined
          ? { config: patch.config as unknown as Prisma.InputJsonValue }
          : {}),
        ...(patch.position !== undefined
          ? { position: patch.position.slice(0, 64) }
          : {}),
      },
      select: { tableId: true },
    });
    await refreshTableSearchText(tx, column.tableId);
  });
}

/**
 * Soft-delete a column. Cell data is left in place deliberately — that is
 * what makes undo a metadata flip rather than a restore, and `DataRowLink`
 * survives because its FK is `Restrict`, not `Cascade` (plan V1-2).
 *
 * The primary column cannot be deleted: titles, promotion and the tree all
 * read through it, and a table without one has no way to name a row.
 */
export async function softDeleteColumn(
  columnId: string
): Promise<{ ok: boolean; reason?: string }> {
  const column = await prisma.dataColumn.findUnique({
    where: { id: columnId },
    select: { isPrimary: true, tableId: true },
  });
  if (!column) return { ok: false, reason: "Column not found" };
  if (column.isPrimary) {
    return { ok: false, reason: "The primary column cannot be deleted" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.dataColumn.update({
      where: { id: columnId },
      data: { deletedAt: new Date() },
    });
    await refreshTableSearchText(tx, column.tableId);
  });
  return { ok: true };
}

/**
 * Recompute the table's schema-derived search text (plan B2), so a table
 * stays findable by its column names after any schema edit.
 */
async function refreshTableSearchText(
  tx: Prisma.TransactionClient,
  tableId: string
): Promise<void> {
  const payload = await tx.dataPayload.findUnique({
    where: { contentId: tableId },
    select: {
      content: { select: { title: true } },
      columns: { where: { deletedAt: null }, orderBy: { position: "asc" } },
    },
  });
  if (!payload) return;

  await tx.dataPayload.update({
    where: { contentId: tableId },
    data: {
      searchText: deriveTableSearchText(
        payload.content.title,
        payload.columns.map((c) => ({
          id: c.id,
          key: c.key,
          name: c.name,
          type: c.type,
          position: c.position,
          isPrimary: c.isPrimary,
          config: (c.config ?? {}) as DataColumnConfig,
          description: c.description,
          deletedAt: null,
        }))
      ),
    },
  });
}

export async function restoreColumn(columnId: string): Promise<void> {
  await prisma.dataColumn.update({
    where: { id: columnId },
    data: { deletedAt: null },
  });
}
