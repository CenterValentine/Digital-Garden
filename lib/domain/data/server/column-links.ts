/**
 * What the AI learns from a `[[Database#Column]]` link: the column's header
 * and its description (lib/domain/data/column-anchor.ts).
 *
 * ONE describer for every AI read of a note — read_content, the chunked
 * reads of the open note, @-mentions, and a charter's reference manifest —
 * so a column link means the same thing to the model wherever it meets one.
 * Each caller collects the column links in what it is about to show (after
 * the private-content strip, so a commented-out link adds nothing) and
 * appends this block.
 *
 * Owner-scoped like read_content: a link to someone else's table describes
 * nothing.
 */

import { prisma } from "@/lib/database/client";
import { onlyUuids } from "@/lib/domain/content/uuid";

/** A column named by a hand-typed `[[Jobs#Status]]` — no id, only a name. */
export interface ColumnNameRef {
  databaseId: string;
  name: string;
  /** For the "no such column" line — the model needs to say WHICH table. */
  databaseTitle?: string;
}

/**
 * What the model does about a column that is named but not there. Also the
 * wording the charter preflight uses — one rule, one phrasing.
 */
export const MISSING_COLUMN_RULE =
  "Do not substitute another column or invent one: stop and offer to create it (propose_database_columns) — unless the user says it exists under another name, then use that one.";

/** Enough for a link-heavy note; a model that needs more reads the schema. */
const MAX_DESCRIBED_COLUMNS = 25;

interface DescribedColumn {
  id: string;
  name: string;
  type: string;
  description: string | null;
  databaseId: string;
  databaseTitle: string;
}

async function loadColumns(
  userId: string,
  columnIds: readonly string[],
  byName: readonly ColumnNameRef[],
): Promise<DescribedColumn[]> {
  const ids = onlyUuids(columnIds).slice(0, MAX_DESCRIBED_COLUMNS);
  const named = byName
    .filter((ref) => ref.name.trim() && onlyUuids([ref.databaseId]).length === 1)
    .slice(0, MAX_DESCRIBED_COLUMNS);
  if (ids.length === 0 && named.length === 0) return [];

  const rows = await prisma.dataColumn.findMany({
    where: {
      deletedAt: null,
      table: { content: { ownerId: userId, deletedAt: null } },
      OR: [
        ...(ids.length ? [{ id: { in: ids } }] : []),
        ...named.map((ref) => ({
          tableId: ref.databaseId,
          name: { equals: ref.name.trim(), mode: "insensitive" as const },
        })),
      ],
    },
    select: {
      id: true,
      name: true,
      type: true,
      description: true,
      tableId: true,
      table: { select: { content: { select: { title: true } } } },
    },
  });

  // Link order, not table order — the model reads them as the note cites them.
  const order = new Map<string, number>();
  ids.forEach((id, index) => order.set(id.toLowerCase(), index));
  named.forEach((ref, index) =>
    order.set(`${ref.databaseId}#${ref.name.trim().toLowerCase()}`, ids.length + index),
  );
  const rank = (row: (typeof rows)[number]) =>
    order.get(row.id.toLowerCase()) ??
    order.get(`${row.tableId}#${row.name.toLowerCase()}`) ??
    Number.MAX_SAFE_INTEGER;

  return rows
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, MAX_DESCRIBED_COLUMNS)
    .map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      description: row.description?.trim() || null,
      databaseId: row.tableId,
      databaseTitle: row.table.content.title,
    }));
}

/**
 * The "Linked database columns" block for the given column links, or "" when
 * there are none (or none resolve). Never throws — a failed lookup must not
 * blank the read it decorates.
 */
export async function describeLinkedColumns(
  userId: string,
  columnIds: readonly string[],
  byName: readonly ColumnNameRef[] = [],
): Promise<string> {
  try {
    const columns = await loadColumns(userId, columnIds, byName);
    // A link that names a column which is not there is a FINDING, not
    // noise: the reader (often a charter run) is about to rely on it. Say
    // so, and say what to do — stop and offer, never substitute
    // (DATABASE-COLUMN-LINKS, owner rule 2026-10-09).
    const foundIds = new Set(columns.map((column) => column.id.toLowerCase()));
    const missingIds = onlyUuids(columnIds).filter((id) => !foundIds.has(id.toLowerCase()));
    const missingNames = byName.filter(
      (ref) =>
        !columns.some(
          (column) =>
            column.databaseId === ref.databaseId &&
            column.name.toLowerCase() === ref.name.trim().toLowerCase(),
        ),
    );
    if (columns.length === 0 && missingIds.length === 0 && missingNames.length === 0) return "";
    const lines = columns.map(
      (column) =>
        `- [[${column.databaseTitle}#${column.name}]] — column "${column.name}" (${column.type}) in database "${column.databaseTitle}" (query_database databaseId: ${column.databaseId}). ` +
        (column.description
          ? `Description: ${column.description}`
          : "No description written for this column."),
    );
    for (const ref of missingNames) {
      const table = ref.databaseTitle ? `"${ref.databaseTitle}"` : `databaseId ${ref.databaseId}`;
      lines.push(
        `- [[${ref.databaseTitle ?? "Database"}#${ref.name.trim()}]] — NO column named "${ref.name.trim()}" exists in ${table}. ${MISSING_COLUMN_RULE}`,
      );
    }
    if (missingIds.length > 0) {
      lines.push(
        `- ${missingIds.length} linked column${missingIds.length === 1 ? " no longer exists" : "s no longer exist"} (deleted, or in a database you cannot read). ${MISSING_COLUMN_RULE}`,
      );
    }
    return (
      "**Linked database columns** (a `[[Database#Column]]` link points at one column — its header and description):\n" +
      lines.join("\n")
    );
  } catch {
    return "";
  }
}
