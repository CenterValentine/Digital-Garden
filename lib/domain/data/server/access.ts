/**
 * Access resolution for database rows and tables.
 *
 * The rule this enforces (plan B3): **row access derives from the table's
 * grant. A promoted row's own grants are additive only, never subtractive.**
 *
 * Un-promoted rows have no `ContentNode` at all, so they are necessarily
 * covered by the table. Promoted rows DO have one, and can therefore diverge —
 * receive a grant the table lacks, or miss one the table has. Left
 * unmanaged that divergence is a quiet data-leak vector, which is why every
 * read and write path is required to come through here.
 *
 * SERVER-ONLY (Prisma). Never import from a `"use client"` module.
 */

import { prisma } from "@/lib/database/client";

export type DataAccessLevel = "none" | "read" | "write" | "owner";

const RANK: Record<DataAccessLevel, number> = {
  none: 0,
  read: 1,
  write: 2,
  owner: 3,
};

/** The stronger of two levels — grants union, they never subtract. */
function strongest(a: DataAccessLevel, b: DataAccessLevel): DataAccessLevel {
  return RANK[a] >= RANK[b] ? a : b;
}

function normalizeGrant(level: string | null | undefined): DataAccessLevel {
  switch (level) {
    case "owner":
      return "owner";
    case "write":
    case "edit":
      return "write";
    case "read":
    case "view":
      return "read";
    default:
      return "none";
  }
}

/**
 * What `userId` may do with the table `tableId` (a `data` ContentNode id).
 *
 * Ownership wins outright; otherwise a `ViewGrant` on the table node applies.
 */
export async function resolveDataTableAccess(
  tableId: string,
  userId: string
): Promise<DataAccessLevel> {
  const node = await prisma.contentNode.findFirst({
    where: { id: tableId, contentType: "data", deletedAt: null },
    select: {
      ownerId: true,
      viewGrants: {
        where: {
          userId,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        select: { accessLevel: true },
      },
    },
  });

  if (!node) return "none";
  if (node.ownerId === userId) return "owner";

  return node.viewGrants.reduce<DataAccessLevel>(
    (acc, g) => strongest(acc, normalizeGrant(g.accessLevel)),
    "none"
  );
}

/**
 * What `userId` may do with one row.
 *
 * Starts from the table's level, then UNIONS any grant on the row's own node
 * if it has been promoted. Never intersects — a row-level grant can only add
 * access, so removing someone from a table cannot be silently undone by a
 * stale grant on a single row, and adding them to one row does not require
 * re-granting the whole table.
 */
export async function resolveDataRowAccess(
  rowId: string,
  userId: string
): Promise<{ level: DataAccessLevel; tableId: string | null }> {
  const row = await prisma.dataRow.findFirst({
    where: { id: rowId, deletedAt: null },
    select: {
      tableId: true,
      content: {
        select: {
          ownerId: true,
          viewGrants: {
            where: {
              userId,
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
            select: { accessLevel: true },
          },
        },
      },
    },
  });

  if (!row) return { level: "none", tableId: null };

  let level = await resolveDataTableAccess(row.tableId, userId);

  if (row.content) {
    if (row.content.ownerId === userId) {
      level = strongest(level, "owner");
    }
    for (const grant of row.content.viewGrants) {
      level = strongest(level, normalizeGrant(grant.accessLevel));
    }
  }

  return { level, tableId: row.tableId };
}

/** True when `level` permits reading. */
export function canRead(level: DataAccessLevel): boolean {
  return RANK[level] >= RANK.read;
}

/** True when `level` permits editing cells and rows. */
export function canWrite(level: DataAccessLevel): boolean {
  return RANK[level] >= RANK.write;
}

/**
 * True when `level` permits SCHEMA changes — adding, retyping, or removing
 * columns, and editing views others can see.
 *
 * Deliberately stricter than `canWrite` (plan Phase 6): a bad cell write
 * damages one value, while a bad column change can invalidate every row in
 * the table. They are not the same permission.
 */
export function canAlterSchema(level: DataAccessLevel): boolean {
  return RANK[level] >= RANK.owner;
}

/**
 * Redact a link whose target the viewer cannot see (plan V1-3).
 *
 * Relation and contentLink cells resolve to titles for display. When the
 * target is out of reach, the placeholder must NOT carry the title — the
 * whole point is that the existence of a private row should not leak through
 * a relation someone else drew to it.
 */
export interface VisibleLinkTarget {
  id: string;
  title: string | null;
  restricted: boolean;
}

export async function resolveLinkTargets(
  contentIds: string[],
  userId: string
): Promise<VisibleLinkTarget[]> {
  if (contentIds.length === 0) return [];

  const visible = await prisma.contentNode.findMany({
    where: {
      id: { in: contentIds },
      deletedAt: null,
      OR: [
        { ownerId: userId },
        {
          viewGrants: {
            some: {
              userId,
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
          },
        },
      ],
    },
    select: { id: true, title: true },
  });

  const byId = new Map(visible.map((n) => [n.id, n.title]));
  return contentIds.map((id) => ({
    id,
    title: byId.get(id) ?? null,
    restricted: !byId.has(id),
  }));
}
