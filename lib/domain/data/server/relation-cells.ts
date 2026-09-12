/**
 * Relation cells for the row-write tools (plan AI-RELATIONAL-DATABASE-REACH
 * P4).
 *
 * A relation column stores NOTHING in `DataRow.data` — its value is the set
 * of `DataRowLink` rows pointing out of that cell. So "set the Experience
 * cell to EXP-012" and "link this row to that row" are the same operation,
 * and the row-write tools can accept relations as ordinary cells instead of
 * needing a linking tool of their own.
 *
 * The model addresses targets the way a person would: by the target row's
 * TITLE (its primary cell), or by a row id it got from query_database. Title
 * resolution is what makes a note-to-tables migration expressible — the model
 * writes "Claims" rows naming the experience it just created, rather than
 * carrying ids it has no way to know.
 *
 * SERVER-ONLY (Prisma).
 */

import { prisma } from "@/lib/database/client";
import { cellToText, keyAtEnd, type DataColumn } from "@/lib/domain/data";
import { canRead, resolveDataTableAccess } from "./access";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ResolvedRelationCell {
  column: DataColumn;
  /** Target row ids, de-duplicated, in the order the model gave them. */
  rowIds: string[];
}

/** Cap per cell — a relation cell is a handful of links, not an import. */
const MAX_LINKS_PER_CELL = 50;

/**
 * Why a relation cell cannot be written, or null when it can. Backlinks are
 * the interesting case: they own no links, so a write through one would
 * create rows no hydration path reads.
 */
export function relationWriteBlock(column: DataColumn): string | null {
  if (column.type !== "relation") return null;
  if (column.config.isBacklink) {
    return `${column.name} mirrors a relation on the other database — it fills in automatically when you link from that side, so never write it directly.`;
  }
  if (!column.config.relationTableId) {
    return `${column.name} is a relation with no target database — it cannot be filled until someone repairs the column.`;
  }
  return null;
}

/**
 * Resolve one relation cell's value to target row ids.
 *
 * Accepts a single value or an array; each entry is a row id or the target
 * row's title. `null` / `[]` clears the cell. Unresolvable titles are an
 * ERROR, never a silent drop: a claim silently unlinked from its experience
 * is exactly the corruption the text-id workaround produced.
 */
export async function resolveRelationCell(
  column: DataColumn,
  raw: unknown,
  viewerId: string,
  cache?: RelationTargetCache
): Promise<{ rowIds: string[] } | { error: string }> {
  const blocked = relationWriteBlock(column);
  if (blocked) return { error: blocked };

  const targetTableId = column.config.relationTableId!;

  // Seeing the target table is a precondition for linking into it — the
  // same rule the links route enforces (plan V1-3).
  const level = await resolveDataTableAccess(targetTableId, viewerId);
  if (!canRead(level)) {
    return {
      error: `${column.name} points at a database you cannot read — the user needs access there before rows can be linked.`,
    };
  }

  const entries = (Array.isArray(raw) ? raw : raw == null ? [] : [raw])
    .map((v) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v)))
    .filter((v) => v.length > 0);
  if (entries.length === 0) return { rowIds: [] };
  if (entries.length > MAX_LINKS_PER_CELL) {
    return {
      error: `${column.name} was given ${entries.length} targets; at most ${MAX_LINKS_PER_CELL} per cell.`,
    };
  }

  const index = await loadTargetIndex(targetTableId, cache);
  if (!index) {
    return { error: `${column.name}'s target database no longer exists.` };
  }
  const { title: targetTitle, byTitle, liveIds } = index;

  const rowIds: string[] = [];
  const missing: string[] = [];
  const ambiguous: string[] = [];
  for (const entry of entries) {
    if (UUID_RE.test(entry)) {
      if (!liveIds.has(entry)) {
        missing.push(entry);
        continue;
      }
      if (!rowIds.includes(entry)) rowIds.push(entry);
      continue;
    }
    const matches = byTitle.get(entry.toLowerCase());
    if (!matches || matches.length === 0) {
      missing.push(entry);
      continue;
    }
    if (matches.length > 1) {
      ambiguous.push(entry);
      continue;
    }
    if (!rowIds.includes(matches[0])) rowIds.push(matches[0]);
  }

  if (missing.length > 0) {
    return {
      error: `${column.name}: "${missing.join('", "')}" ${missing.length === 1 ? "is not a row" : "are not rows"} in "${targetTitle}". Link only to rows that exist — create them there first, or query_database that table for the exact titles.`,
    };
  }
  if (ambiguous.length > 0) {
    return {
      error: `${column.name}: "${ambiguous.join('", "')}" ${ambiguous.length === 1 ? "matches" : "match"} more than one row in "${targetTitle}" — use the row id from query_database instead of the title.`,
    };
  }
  return { rowIds };
}


/**
 * One target table's title index, built once and reused.
 *
 * Without the cache, a 25-row insert touching two relation columns would
 * re-read the same target table 50 times. The index is per tool call and
 * deliberately not shared beyond it — rows created earlier in the same call
 * must not be visible as link targets from a stale snapshot.
 */
export type RelationTargetCache = Map<string, TargetIndex | null>;

export function createRelationTargetCache(): RelationTargetCache {
  return new Map();
}

interface TargetIndex {
  title: string;
  /** Lower-cased primary-cell text → row ids carrying it. */
  byTitle: Map<string, string[]>;
  liveIds: Set<string>;
}

async function loadTargetIndex(
  targetTableId: string,
  cache?: RelationTargetCache
): Promise<TargetIndex | null> {
  const cached = cache?.get(targetTableId);
  if (cached !== undefined) return cached;

  const target = await prisma.dataPayload.findUnique({
    where: { contentId: targetTableId },
    select: {
      content: { select: { title: true } },
      columns: { where: { deletedAt: null }, orderBy: { position: "asc" } },
      rows: { where: { deletedAt: null }, select: { id: true, data: true } },
    },
  });
  if (!target) {
    cache?.set(targetTableId, null);
    return null;
  }

  const primary =
    target.columns.find((c) => c.isPrimary) ?? target.columns[0] ?? null;
  const byTitle = new Map<string, string[]>();
  if (primary) {
    for (const row of target.rows) {
      const data = (row.data ?? {}) as Record<string, unknown>;
      const text = cellToText(
        {
          id: primary.id,
          key: primary.key,
          name: primary.name,
          type: primary.type,
          position: primary.position,
          isPrimary: primary.isPrimary,
          config: (primary.config ?? {}) as DataColumn["config"],
          description: primary.description,
          deletedAt: null,
        },
        data[primary.key] as never
      );
      if (!text) continue;
      const key = text.trim().toLowerCase();
      const list = byTitle.get(key);
      if (list) list.push(row.id);
      else byTitle.set(key, [row.id]);
    }
  }

  const index: TargetIndex = {
    title: target.content.title,
    byTitle,
    liveIds: new Set(target.rows.map((r) => r.id)),
  };
  cache?.set(targetTableId, index);
  return index;
}

/**
 * Make one relation cell's links equal `rowIds` — add what is missing,
 * remove what is no longer named.
 *
 * REPLACE, not append, because that is how every other cell behaves: writing
 * a cell sets it. An append-only relation would be the one field in the grid
 * a user could not correct by writing it again.
 */
export async function writeRelationLinks(
  columnId: string,
  fromRowId: string,
  rowIds: string[]
): Promise<{ added: number; removed: number }> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.dataRowLink.findMany({
      where: { columnId, fromRowId },
      select: { id: true, toRowId: true, position: true },
      orderBy: { position: "asc" },
    });
    const have = new Set(existing.map((l) => l.toRowId));
    const want = new Set(rowIds);

    const stale = existing.filter((l) => !want.has(l.toRowId));
    if (stale.length > 0) {
      await tx.dataRowLink.deleteMany({
        where: { id: { in: stale.map((l) => l.id) } },
      });
    }

    let position = existing.at(-1)?.position ?? null;
    let added = 0;
    for (const toRowId of rowIds) {
      if (have.has(toRowId)) continue;
      position = keyAtEnd(position);
      await tx.dataRowLink.create({
        data: { columnId, fromRowId, toRowId, position },
      });
      added += 1;
    }
    return { added, removed: stale.length };
  });
}
