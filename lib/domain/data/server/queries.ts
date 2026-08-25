/**
 * Read paths for the database content type.
 *
 * Two jobs, kept apart on purpose:
 *   - `loadTable` fetches the SCHEMA (columns + views). Small, cacheable,
 *     always fetched whole.
 *   - `loadRowPage` fetches a PAGE of rows. Cursor-based, filtered and sorted
 *     in SQL so the client never pages through rows to find three.
 *
 * The filter tree is translated to SQL here, and evaluated in-memory by
 * `filters.ts` for client-side preview. Those two must agree — see the note
 * on `filterToWhere` below.
 *
 * SERVER-ONLY (Prisma).
 */

import { prisma } from "@/lib/database/client";
// Value import, not `import type`: `Prisma.DbNull` below is a runtime
// sentinel, not a type.
import { Prisma } from "@/lib/database/generated/prisma";
import {
  isFilterGroup,
  resolveDateWindow,
  sortByKey,
  sortStatusOptions,
  type DataColumn,
  type DataColumnConfig,
  type DataSort,
  type DataTable,
  type DataView,
  type DataViewConfig,
  type FilterCondition,
  type FilterNode,
  type RelationLinkRef,
  type RelativeDateWindow,
  type RowData,
  type RowPage,
  type RowPageCursor,
  DEFAULT_ROW_PAGE_SIZE,
} from "@/lib/domain/data";

// ── Row shape returned to callers ────────────────────────────────────────

export interface LoadedRow {
  id: string;
  tableId: string;
  sortKey: string;
  data: RowData;
  contentId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Schema ───────────────────────────────────────────────────────────────

/**
 * Load a table's schema. Soft-deleted columns are excluded from the result
 * but NOT from storage — a cell whose column was removed keeps its value so
 * that undoing the delete restores real data (plan B4).
 */
export async function loadTable(
  tableId: string,
  viewerId?: string
): Promise<DataTable | null> {
  const payload = await prisma.dataPayload.findUnique({
    where: { contentId: tableId },
    include: {
      content: { select: { title: true } },
      columns: {
        where: { deletedAt: null },
        orderBy: { position: "asc" },
      },
      views: {
        // Personal views are visible ONLY to their owner (plan O14) — hidden
        // from everyone else's bar, exactly Airtable's semantics. Omitting
        // viewerId (internal callers like the AI digest) shows only shared
        // views, which is the safe direction to fail in.
        where: {
          OR: [
            { access: { not: "personal" } },
            ...(viewerId ? [{ ownerId: viewerId }] : []),
          ],
        },
        orderBy: { position: "asc" },
      },
    },
  });

  if (!payload) return null;

  const columns: DataColumn[] = payload.columns.map((c) => ({
    id: c.id,
    key: c.key,
    name: c.name,
    type: c.type,
    position: c.position,
    isPrimary: c.isPrimary,
    config: (c.config ?? {}) as unknown as DataColumnConfig,
    description: c.description,
    deletedAt: c.deletedAt ? c.deletedAt.toISOString() : null,
  }));

  const views: DataView[] = payload.views.map((v) => ({
    id: v.id,
    tableId: v.tableId,
    ownerId: v.ownerId,
    name: v.name,
    mode: v.mode as DataView["mode"],
    access: v.access as DataView["access"],
    section: v.section,
    filters: (v.filters ?? { op: "and", children: [] }) as unknown as FilterNode,
    sorts: (v.sorts ?? []) as unknown as DataSort[],
    groupByColumnId: v.groupByColumnId,
    columnPrefs: (v.columnPrefs ?? {}) as unknown as DataView["columnPrefs"],
    config: (v.config ?? {}) as unknown as DataViewConfig,
    position: v.position,
  }));

  return {
    contentId: payload.contentId,
    title: payload.content.title,
    mode: payload.mode as DataTable["mode"],
    description: payload.description,
    defaultViewId: payload.defaultViewId,
    rowCount: payload.rowCount,
    columns,
    views,
  };
}

/**
 * Which view to open with. `defaultViewId` is deliberately not an FK, so it
 * can dangle after a view delete — falling back to first-by-position keeps a
 * table openable instead of erroring on stale state.
 */
export function resolveView(
  table: DataTable,
  requestedViewId: string | null
): DataView | null {
  if (requestedViewId) {
    const found = table.views.find((v) => v.id === requestedViewId);
    if (found) return found;
  }
  if (table.defaultViewId) {
    const fallback = table.views.find((v) => v.id === table.defaultViewId);
    if (fallback) return fallback;
  }
  return table.views[0] ?? null;
}

// ── Filter → SQL ─────────────────────────────────────────────────────────

/**
 * Translate one condition into a Prisma JSON filter.
 *
 * IMPORTANT: this must stay semantically identical to `evaluateFilter` in
 * `filters.ts`. Two places, one meaning — if they drift, a filtered view and
 * its client-side preview disagree and neither errors. The subtle case is
 * empty cells: every positive operator fails on an absent key, EXCEPT `isNot`
 * and `notContains`, where "no value" genuinely is "not that value".
 */
function conditionToWhere(
  condition: FilterCondition,
  column: DataColumn,
  now: Date
): Prisma.DataRowWhereInput | null {
  const path = [column.key];

  switch (condition.operator) {
    // ⚠ VERIFY ONCE THE SCHEMA LANDS. Our storage model is empty-is-ABSENT
    // (plan B8c) — a cleared cell deletes its key rather than writing null.
    // Prisma's `equals: DbNull` targets a database NULL, and whether a
    // missing JSONB path resolves to that is exactly the ambiguous case.
    // If this proves wrong, the correct form is a raw jsonb existence test
    // (`NOT (data ? 'key')`), which needs `$queryRaw` or a computed filter.
    // Flagged rather than guessed: an isEmpty that silently matches nothing
    // looks like an empty table, and an isEmpty that matches everything
    // looks like a broken filter.
    case "isEmpty":
      return { data: { path, equals: Prisma.DbNull } };
    case "isNotEmpty":
      return { NOT: { data: { path, equals: Prisma.DbNull } } };

    case "is":
      return { data: { path, equals: condition.value as Prisma.InputJsonValue } };
    case "isNot":
      return {
        NOT: { data: { path, equals: condition.value as Prisma.InputJsonValue } },
      };

    case "contains":
      return { data: { path, string_contains: String(condition.value) } };
    case "notContains":
      return {
        NOT: { data: { path, string_contains: String(condition.value) } },
      };
    case "startsWith":
      return { data: { path, string_starts_with: String(condition.value) } };

    case "gt":
      return { data: { path, gt: condition.value as number | string } };
    case "gte":
      return { data: { path, gte: condition.value as number | string } };
    case "lt":
      return { data: { path, lt: condition.value as number | string } };
    case "lte":
      return { data: { path, lte: condition.value as number | string } };

    case "hasAny": {
      const wanted = Array.isArray(condition.value)
        ? condition.value
        : [condition.value];
      return {
        OR: wanted.map((v) => ({
          data: { path, array_contains: [v] as Prisma.InputJsonValue },
        })),
      };
    }
    case "hasAll": {
      const wanted = Array.isArray(condition.value)
        ? condition.value
        : [condition.value];
      return {
        AND: wanted.map((v) => ({
          data: { path, array_contains: [v] as Prisma.InputJsonValue },
        })),
      };
    }
    case "hasNone": {
      const wanted = Array.isArray(condition.value)
        ? condition.value
        : [condition.value];
      return {
        NOT: {
          OR: wanted.map((v) => ({
            data: { path, array_contains: [v] as Prisma.InputJsonValue },
          })),
        },
      };
    }

    case "isWithin": {
      const { from, to } = resolveDateWindow(
        condition.value as RelativeDateWindow,
        now
      );
      return {
        AND: [
          { data: { path, gte: from.toISOString() } },
          { data: { path, lt: to.toISOString() } },
        ],
      };
    }

    default:
      return null;
  }
}

function filterToWhere(
  node: FilterNode,
  columns: DataColumn[],
  now: Date
): Prisma.DataRowWhereInput | null {
  if (isFilterGroup(node)) {
    const children = node.children
      .map((c) => filterToWhere(c, columns, now))
      .filter((c): c is Prisma.DataRowWhereInput => c !== null);
    if (children.length === 0) return null;
    return node.op === "and" ? { AND: children } : { OR: children };
  }

  const column = columns.find((c) => c.id === node.columnId);
  // Mirrors the evaluator: a filter on a removed column matches everything
  // rather than nothing. Hiding every row because a column went away looks
  // like data loss to the person staring at the screen.
  if (!column || column.deletedAt) return null;

  return conditionToWhere(node, column, now);
}

// ── Rows ─────────────────────────────────────────────────────────────────

export interface LoadRowsOptions {
  tableId: string;
  view: DataView | null;
  columns: DataColumn[];
  cursor?: RowPageCursor | null;
  limit?: number;
  now?: Date;
  /** Needed to redact relation targets the viewer cannot see (plan V1-3). */
  viewerId?: string;
}

/**
 * Hydrate relation cells for a page of rows (plan Phase 4).
 *
 * Links live ONLY in DataRowLink (plan D4); this attaches a read model:
 * per row, per relation column, the linked rows' display titles. Titles
 * come from each target table's primary column. Target tables the viewer
 * cannot read yield `restricted: true` with NO title — the V1-3 rule: the
 * existence of a private row must not leak through a relation someone
 * else drew to it.
 */
async function hydrateRelationLinks(
  rows: Array<{ id: string }>,
  columns: DataColumn[],
  viewerId: string | undefined
): Promise<Map<string, Record<string, RelationLinkRef[]>>> {
  const relationColumns = columns.filter(
    (c) => c.type === "relation" && !c.deletedAt
  );
  const result = new Map<string, Record<string, RelationLinkRef[]>>();
  if (relationColumns.length === 0 || rows.length === 0) return result;

  const links = await prisma.dataRowLink.findMany({
    where: {
      fromRowId: { in: rows.map((r) => r.id) },
      columnId: { in: relationColumns.map((c) => c.id) },
    },
    orderBy: { position: "asc" },
    select: { id: true, columnId: true, fromRowId: true, toRowId: true },
  });
  if (links.length === 0) return result;

  const targetRows = await prisma.dataRow.findMany({
    where: { id: { in: [...new Set(links.map((l) => l.toRowId))] } },
    select: { id: true, tableId: true, data: true, deletedAt: true },
  });
  const targetById = new Map(targetRows.map((r) => [r.id, r]));

  const targetTableIds = [...new Set(targetRows.map((r) => r.tableId))];
  const primaries = await prisma.dataColumn.findMany({
    where: { tableId: { in: targetTableIds }, isPrimary: true, deletedAt: null },
    select: { tableId: true, key: true },
  });
  const primaryKeyByTable = new Map(primaries.map((p) => [p.tableId, p.key]));

  // Visibility per TARGET TABLE: its owner, or a live grant on its node.
  const visibleTables = new Set<string>();
  if (targetTableIds.length > 0 && viewerId) {
    const nodes = await prisma.contentNode.findMany({
      where: {
        id: { in: targetTableIds },
        deletedAt: null,
        OR: [
          { ownerId: viewerId },
          {
            viewGrants: {
              some: {
                userId: viewerId,
                OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
              },
            },
          },
        ],
      },
      select: { id: true },
    });
    for (const n of nodes) visibleTables.add(n.id);
  }

  for (const link of links) {
    const target = targetById.get(link.toRowId);
    if (!target || target.deletedAt) continue;
    const visible = visibleTables.has(target.tableId);
    const primaryKey = primaryKeyByTable.get(target.tableId);
    const raw = primaryKey
      ? (target.data as Record<string, unknown>)?.[primaryKey]
      : undefined;
    const ref: RelationLinkRef = {
      linkId: link.id,
      rowId: link.toRowId,
      title:
        visible && typeof raw === "string" && raw
          ? raw
          : visible
            ? "Untitled"
            : "",
      restricted: !visible,
    };
    const perRow = result.get(link.fromRowId) ?? {};
    (perRow[link.columnId] ??= []).push(ref);
    result.set(link.fromRowId, perRow);
  }
  return result;
}

// ── Sort → SQL ───────────────────────────────────────────────────────────

/**
 * ORDER BY fragment for one sort, typed per column (plan B8c pays off here):
 *  - numbers/booleans get a guarded cast — text ordering would put "10"
 *    before "9", and jsonb_typeof guards junk from throwing;
 *  - select/status order by OPTION POSITION via a CASE over option ids —
 *    cells store ids (plan D3), and id ordering is meaningless;
 *  - everything else orders as text, which for ISO-8601 dates IS
 *    chronological order — the reason dates are stored that way.
 * NULLS LAST both directions: empty cells sink, matching every grid users
 * know. All user-adjacent values ride as bind parameters; the direction
 * keyword is whitelisted, never interpolated from input.
 */
function sortToOrderBy(
  sorts: DataSort[],
  columns: DataColumn[]
): Prisma.Sql[] {
  const fragments: Prisma.Sql[] = [];
  for (const sort of sorts) {
    const column = columns.find((c) => c.id === sort.columnId && !c.deletedAt);
    if (!column) continue; // a sort on a removed column is skipped, not fatal
    const dir =
      sort.direction === "desc" ? Prisma.sql`DESC` : Prisma.sql`ASC`;

    let expr: Prisma.Sql;
    if (column.type === "number") {
      expr = Prisma.sql`(CASE WHEN jsonb_typeof("data"->${column.key}) = 'number' THEN ("data"->>${column.key})::numeric END)`;
    } else if (column.type === "checkbox") {
      expr = Prisma.sql`(CASE WHEN jsonb_typeof("data"->${column.key}) = 'boolean' THEN ("data"->>${column.key})::boolean END)`;
    } else if (
      (column.type === "select" || column.type === "status") &&
      (column.config.options?.length ?? 0) > 0
    ) {
      const options =
        column.type === "status"
          ? sortStatusOptions(column.config.options ?? [])
          : (column.config.options ?? []);
      const whens = options.map(
        (o, i) => Prisma.sql`WHEN ${o.id} THEN ${i}`
      );
      expr = Prisma.sql`(CASE "data"->>${column.key} ${Prisma.join(whens, " ")} END)`;
    } else {
      expr = Prisma.sql`"data"->>${column.key}`;
    }
    fragments.push(Prisma.sql`${expr} ${dir} NULLS LAST`);
  }
  return fragments;
}

interface RawSortedRow {
  id: string;
  tableId: string;
  sortKey: string;
  data: unknown;
  contentId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * One page of rows.
 *
 * Cursor-based on `(sortKey, id)` rather than offset — offset pagination
 * skips and duplicates rows under concurrent insertion, which is exactly
 * what a shared table has (plan B8d). The id tiebreak keeps the order total
 * even if two sort keys ever collide.
 *
 * With VIEW SORTS active the read switches to raw SQL — Prisma cannot
 * orderBy a JSONB path. Filters still run through the ONE Prisma compiler
 * (filterToWhere) as an id-preselect, so the filter semantics cannot fork
 * into a third implementation; the raw query only orders and pages the
 * matching ids. Sorted views serve the first `limit` rows with an accurate
 * total — deep pagination lands with the pagination UI, which no path has
 * yet.
 */
export async function loadRowPage({
  tableId,
  view,
  columns,
  cursor = null,
  limit = DEFAULT_ROW_PAGE_SIZE,
  now = new Date(),
  viewerId,
}: LoadRowsOptions): Promise<RowPage> {
  const filterWhere = view ? filterToWhere(view.filters, columns, now) : null;

  const baseWhere: Prisma.DataRowWhereInput = {
    tableId,
    deletedAt: null,
    ...(filterWhere ? { AND: [filterWhere] } : {}),
  };

  const orderFragments = view?.sorts?.length
    ? sortToOrderBy(view.sorts, columns)
    : [];

  if (orderFragments.length > 0) {
    // Filter via Prisma (one compiler), order via SQL. Id-preselect is cheap
    // at this feature's design scale (plan D1: ≤10k rows per table).
    const matching = await prisma.dataRow.findMany({
      where: baseWhere,
      select: { id: true },
    });
    if (matching.length === 0) {
      return { rows: [], nextCursor: null, total: 0 };
    }
    const ids = matching.map((m) => m.id);
    const raw = await prisma.$queryRaw<RawSortedRow[]>(Prisma.sql`
      SELECT "id", "tableId", "sortKey", "data", "contentId", "createdAt", "updatedAt"
      FROM "DataRow"
      WHERE "id" = ANY(${ids}::uuid[])
      ORDER BY ${Prisma.join(orderFragments, ", ")}, "id" ASC
      LIMIT ${limit}
    `);
    const sortedLinks = await hydrateRelationLinks(raw, columns, viewerId);
    return {
      rows: raw.map((r) => ({
        id: r.id,
        tableId: r.tableId,
        sortKey: r.sortKey,
        data: (r.data ?? {}) as RowData,
        links: sortedLinks.get(r.id),
        contentId: r.contentId,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
      nextCursor: null,
      total: ids.length,
    };
  }

  const cursorWhere: Prisma.DataRowWhereInput | null = cursor
    ? {
        OR: [
          { sortKey: { gt: cursor.sortKey } },
          { sortKey: cursor.sortKey, id: { gt: cursor.id } },
        ],
      }
    : null;

  const where: Prisma.DataRowWhereInput = cursorWhere
    ? { AND: [baseWhere, cursorWhere] }
    : baseWhere;

  // One extra row tells us whether another page exists without a second query.
  const [rows, total] = await Promise.all([
    prisma.dataRow.findMany({
      where,
      orderBy: [{ sortKey: "asc" }, { id: "asc" }],
      take: limit + 1,
      select: {
        id: true,
        tableId: true,
        sortKey: true,
        data: true,
        contentId: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.dataRow.count({ where: baseWhere }),
  ]);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const pageLinks = await hydrateRelationLinks(page, columns, viewerId);

  return {
    rows: page.map((r) => ({
      id: r.id,
      tableId: r.tableId,
      sortKey: r.sortKey,
      data: (r.data ?? {}) as unknown as RowData,
      links: pageLinks.get(r.id),
      contentId: r.contentId,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
    nextCursor: hasMore && last ? { sortKey: last.sortKey, id: last.id } : null,
    total,
  };
}

/**
 * Rows changed since `since` — the poller's payload (plan B8d).
 *
 * Returns deletions separately, because a row that vanished from a filtered
 * view and a row that was actually deleted need different client handling:
 * one is a re-filter, the other removes it from every view at once.
 */
export async function loadRowChanges(
  tableId: string,
  since: Date
): Promise<{ changed: LoadedRow[]; deletedIds: string[] }> {
  const [changed, deleted] = await Promise.all([
    prisma.dataRow.findMany({
      where: { tableId, deletedAt: null, updatedAt: { gt: since } },
      orderBy: [{ sortKey: "asc" }, { id: "asc" }],
      take: 500,
      select: {
        id: true,
        tableId: true,
        sortKey: true,
        data: true,
        contentId: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.dataRow.findMany({
      where: { tableId, deletedAt: { gt: since } },
      select: { id: true },
      take: 500,
    }),
  ]);

  return {
    changed: changed.map((r) => ({
      id: r.id,
      tableId: r.tableId,
      sortKey: r.sortKey,
      data: (r.data ?? {}) as unknown as RowData,
      contentId: r.contentId,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
    deletedIds: deleted.map((d) => d.id),
  };
}

/** Rows in view order, for exports and the AI query tool. */
export function orderRows(rows: LoadedRow[]): LoadedRow[] {
  return sortByKey(rows);
}
