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
  cellToText,
  isFilterGroup,
  resolveDateWindow,
  sortByKey,
  sortStatusOptions,
  type CellValue,
  type DataColumn,
  type DataColumnConfig,
  type DataRow,
  type DataSort,
  type DataTable,
  type DataView,
  type DataViewConfig,
  type FilterCondition,
  type ContentRef,
  type FilterNode,
  type PersonRef,
  type RelationLinkRef,
  type RelativeDateWindow,
  type RowData,
  type RowPage,
  type RowPageCursor,
  DEFAULT_ROW_PAGE_SIZE,
} from "@/lib/domain/data";
import { parseContentQuery } from "./query-mode";

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
    // Honor the DataTable.query contract ("present when mode === 'query'").
    // Consumers that branch on table.query (CSV export, flashcards
    // from-data) silently saw zero rows for query tables without this.
    ...(payload.mode === "query"
      ? { query: parseContentQuery(payload.source) }
      : {}),
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
 * per row, per relation column, the linked rows' display titles.
 *
 * Two directions, one storage (the appendix rule — symmetry is a property
 * of the COLUMNS, not the storage):
 *  - a FORWARD column owns its links: match fromRowId, display the to-row;
 *  - a BACKLINK column (config.symmetricColumnId set) owns nothing: it
 *    reads the forward column's links with the direction flipped — match
 *    toRowId, display the from-row.
 *
 * Titles come from each displayed row's table's primary column. Tables the
 * viewer cannot read yield `restricted: true` with NO title — the V1-3
 * rule: the existence of a private row must not leak through a relation
 * someone else drew to it.
 */
interface HydratedLinks {
  refs: Map<string, Record<string, RelationLinkRef[]>>;
  /** Data of displayed rows the viewer may SEE — restricted rows absent, so
   * derived computation cannot leak values through an aggregate. */
  targetData: Map<string, { tableId: string; data: RowData }>;
}

async function hydrateRelationLinks(
  rows: Array<{ id: string }>,
  columns: DataColumn[],
  viewerId: string | undefined
): Promise<HydratedLinks> {
  const relationColumns = columns.filter(
    (c) => c.type === "relation" && !c.deletedAt
  );
  const result = new Map<string, Record<string, RelationLinkRef[]>>();
  const targetData = new Map<string, { tableId: string; data: RowData }>();
  if (relationColumns.length === 0 || rows.length === 0)
    return { refs: result, targetData };

  const rowIds = rows.map((r) => r.id);
  // The pair cross-references both ways, so symmetricColumnId is set on
  // BOTH halves — isBacklink is the discriminator.
  const forward = relationColumns.filter((c) => !c.config.isBacklink);
  const backward = relationColumns.filter(
    (c) => c.config.isBacklink && c.config.symmetricColumnId
  );

  /** attachRowId/attachColumnId = where the chip renders;
   *  displayRowId = whose title it shows. */
  const entries: Array<{
    attachRowId: string;
    attachColumnId: string;
    displayRowId: string;
    linkId: string;
    position: string;
  }> = [];

  if (forward.length > 0) {
    const links = await prisma.dataRowLink.findMany({
      where: {
        fromRowId: { in: rowIds },
        columnId: { in: forward.map((c) => c.id) },
      },
      orderBy: { position: "asc" },
      select: { id: true, columnId: true, fromRowId: true, toRowId: true, position: true },
    });
    for (const l of links) {
      entries.push({
        attachRowId: l.fromRowId,
        attachColumnId: l.columnId,
        displayRowId: l.toRowId,
        linkId: l.id,
        position: l.position,
      });
    }
  }

  if (backward.length > 0) {
    const bySymmetric = new Map(
      backward.map((c) => [c.config.symmetricColumnId as string, c.id])
    );
    const links = await prisma.dataRowLink.findMany({
      where: {
        toRowId: { in: rowIds },
        columnId: { in: [...bySymmetric.keys()] },
      },
      orderBy: { position: "asc" },
      select: { id: true, columnId: true, fromRowId: true, toRowId: true, position: true },
    });
    for (const l of links) {
      entries.push({
        attachRowId: l.toRowId,
        attachColumnId: bySymmetric.get(l.columnId)!,
        displayRowId: l.fromRowId,
        linkId: l.id,
        position: l.position,
      });
    }
  }
  if (entries.length === 0) return { refs: result, targetData };

  const displayRows = await prisma.dataRow.findMany({
    where: { id: { in: [...new Set(entries.map((e) => e.displayRowId))] } },
    select: { id: true, tableId: true, data: true, deletedAt: true },
  });
  const displayById = new Map(displayRows.map((r) => [r.id, r]));

  const displayTableIds = [...new Set(displayRows.map((r) => r.tableId))];
  const primaries = await prisma.dataColumn.findMany({
    where: { tableId: { in: displayTableIds }, isPrimary: true, deletedAt: null },
    select: { tableId: true, key: true },
  });
  const primaryKeyByTable = new Map(primaries.map((p) => [p.tableId, p.key]));

  // Visibility per displayed row's TABLE: its owner, or a live grant.
  const visibleTables = new Set<string>();
  if (displayTableIds.length > 0 && viewerId) {
    const nodes = await prisma.contentNode.findMany({
      where: {
        id: { in: displayTableIds },
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

  for (const row of displayRows) {
    if (!row.deletedAt && visibleTables.has(row.tableId)) {
      targetData.set(row.id, {
        tableId: row.tableId,
        data: (row.data ?? {}) as RowData,
      });
    }
  }

  for (const entry of entries) {
    const target = displayById.get(entry.displayRowId);
    if (!target || target.deletedAt) continue;
    const visible = visibleTables.has(target.tableId);
    const primaryKey = primaryKeyByTable.get(target.tableId);
    const raw = primaryKey
      ? (target.data as Record<string, unknown>)?.[primaryKey]
      : undefined;
    const ref: RelationLinkRef = {
      linkId: entry.linkId,
      rowId: entry.displayRowId,
      title:
        visible && typeof raw === "string" && raw
          ? raw
          : visible
            ? "Untitled"
            : "",
      restricted: !visible,
    };
    const perRow = result.get(entry.attachRowId) ?? {};
    (perRow[entry.attachColumnId] ??= []).push(ref);
    result.set(entry.attachRowId, perRow);
  }
  return { refs: result, targetData };
}

/**
 * Hydrate contentLink cells (plan Phase 4): the cell stores ContentNode ids
 * (plan B8c); this resolves them to titles + content types for chips, in
 * CELL ORDER (the array is order-significant). V1-3 stance throughout: a
 * node the viewer cannot open — no ownership, no live grant, or deleted —
 * yields restricted with NO title; a dangling id (target hard-gone) renders
 * the same way rather than crashing or silently vanishing (plan G12).
 */
async function hydrateContentRefs(
  rows: Array<{ id: string; data: unknown }>,
  columns: DataColumn[],
  viewerId: string | undefined
): Promise<Map<string, Record<string, ContentRef[]>>> {
  const result = new Map<string, Record<string, ContentRef[]>>();
  // `file` cells share the contentLink shape (id-arrays of nodes, plan
  // B8b) — one hydrator serves both, so redaction cannot fork.
  const linkColumns = columns.filter(
    (c) => (c.type === "contentLink" || c.type === "file") && !c.deletedAt
  );
  if (linkColumns.length === 0 || rows.length === 0) return result;

  const allIds = new Set<string>();
  for (const row of rows) {
    const data = (row.data ?? {}) as Record<string, unknown>;
    for (const column of linkColumns) {
      const cell = data[column.key];
      if (Array.isArray(cell)) {
        for (const id of cell) if (typeof id === "string") allIds.add(id);
      }
    }
  }
  if (allIds.size === 0) return result;

  const visible = viewerId
    ? await prisma.contentNode.findMany({
        where: {
          id: { in: [...allIds] },
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
        select: {
          id: true,
          title: true,
          contentType: true,
          filePayload: {
            select: {
              thumbnailUrl: true,
              width: true,
              height: true,
              blurDataUrl: true,
              mimeType: true,
            },
          },
        },
      })
    : [];
  const byId = new Map(visible.map((n) => [n.id, n]));

  for (const row of rows) {
    const data = (row.data ?? {}) as Record<string, unknown>;
    const perColumn: Record<string, ContentRef[]> = {};
    for (const column of linkColumns) {
      const cell = data[column.key];
      if (!Array.isArray(cell) || cell.length === 0) continue;
      perColumn[column.id] = cell
        .filter((id): id is string => typeof id === "string")
        .map((id) => {
          const node = byId.get(id);
          return node
            ? {
                id,
                title: node.title || "Untitled",
                contentType: node.contentType,
                restricted: false,
                file: node.filePayload
                  ? {
                      thumbnailUrl: node.filePayload.thumbnailUrl,
                      width: node.filePayload.width,
                      height: node.filePayload.height,
                      blurDataUrl: node.filePayload.blurDataUrl,
                      mimeType: node.filePayload.mimeType,
                    }
                  : null,
              }
            : { id, title: "", contentType: null, restricted: true };
        });
    }
    if (Object.keys(perColumn).length > 0) result.set(row.id, perColumn);
  }
  return result;
}

/**
 * Hydrate person cells (plan Phase 4). The cell stores ONE id whose space
 * the column's `personSource` declares:
 *  - "person" (default): the people extension's Person entities. Resolved
 *    when owned by the VIEWER or the TABLE OWNER (a shared table shows the
 *    author's contacts by name); anything else — or a deleted person —
 *    renders restricted with no name (plan V1-3).
 *  - "user": app accounts. Names resolve for any account on the instance —
 *    collaborators' usernames are not secrets between people sharing a
 *    table.
 */
async function hydratePersonRefs(
  rows: Array<{ id: string; data: unknown }>,
  columns: DataColumn[],
  tableId: string,
  viewerId: string | undefined
): Promise<Map<string, Record<string, PersonRef>>> {
  const result = new Map<string, Record<string, PersonRef>>();
  const personColumns = columns.filter(
    (c) => c.type === "person" && !c.deletedAt
  );
  if (personColumns.length === 0 || rows.length === 0) return result;

  const personIds = new Set<string>();
  const userIds = new Set<string>();
  for (const row of rows) {
    const data = (row.data ?? {}) as Record<string, unknown>;
    for (const column of personColumns) {
      const cell = data[column.key];
      if (typeof cell !== "string" || !cell) continue;
      if ((column.config.personSource ?? "person") === "user") {
        userIds.add(cell);
      } else {
        personIds.add(cell);
      }
    }
  }
  if (personIds.size === 0 && userIds.size === 0) return result;

  const tableOwner = await prisma.contentNode.findUnique({
    where: { id: tableId },
    select: { ownerId: true },
  });
  const allowedOwners = [
    ...new Set(
      [viewerId, tableOwner?.ownerId].filter((v): v is string => !!v)
    ),
  ];

  const [persons, users] = await Promise.all([
    personIds.size > 0
      ? prisma.person.findMany({
          where: {
            id: { in: [...personIds] },
            deletedAt: null,
            ownerId: { in: allowedOwners },
          },
          select: { id: true, displayName: true },
        })
      : Promise.resolve([]),
    userIds.size > 0
      ? prisma.user.findMany({
          where: { id: { in: [...userIds] } },
          // No email: it must never reach other readers of the table
          // (privacy review, 2026-08-27) — username or a generic label.
          select: { id: true, username: true },
        })
      : Promise.resolve([]),
  ]);
  const personById = new Map(persons.map((p) => [p.id, p.displayName]));
  const userById = new Map(
    users.map((u) => [u.id, u.username || "User"])
  );

  for (const row of rows) {
    const data = (row.data ?? {}) as Record<string, unknown>;
    const perColumn: Record<string, PersonRef> = {};
    for (const column of personColumns) {
      const cell = data[column.key];
      if (typeof cell !== "string" || !cell) continue;
      const source = column.config.personSource ?? "person";
      const name =
        source === "user" ? userById.get(cell) : personById.get(cell);
      perColumn[column.id] = name
        ? { id: cell, name, restricted: false }
        : { id: cell, name: "", restricted: true };
    }
    if (Object.keys(perColumn).length > 0) result.set(row.id, perColumn);
  }
  return result;
}

/**
 * Compute lookup/rollup values (plan Phase 4, D6 — derived columns store
 * NOTHING; this happens at every read). Aggregates run over VISIBLE targets
 * only: hydration's targetData omits rows the viewer cannot see, so a
 * rollup can never launder a private table's values through a sum.
 */
async function computeDerivedValues(
  rows: Array<{ id: string }>,
  columns: DataColumn[],
  hydrated: HydratedLinks
): Promise<Map<string, Record<string, string | number>>> {
  const result = new Map<string, Record<string, string | number>>();
  const derivedColumns = columns.filter(
    (c) => (c.type === "lookup" || c.type === "rollup") && !c.deletedAt
  );
  if (derivedColumns.length === 0 || rows.length === 0) return result;

  // The target-table columns these deriveds read through.
  const targetColumnIds = [
    ...new Set(
      derivedColumns
        .map((c) => c.config.lookupColumnId ?? c.config.rollupColumnId)
        .filter((id): id is string => !!id)
    ),
  ];
  const targetColumns =
    targetColumnIds.length > 0
      ? await prisma.dataColumn.findMany({
          where: { id: { in: targetColumnIds }, deletedAt: null },
        })
      : [];
  const targetColumnById = new Map(
    targetColumns.map((c) => [
      c.id,
      {
        id: c.id,
        key: c.key,
        name: c.name,
        type: c.type,
        position: c.position,
        isPrimary: c.isPrimary,
        config: (c.config ?? {}) as unknown as DataColumnConfig,
        description: c.description,
        deletedAt: null,
      } as DataColumn,
    ])
  );

  for (const row of rows) {
    const perColumn: Record<string, string | number> = {};
    for (const column of derivedColumns) {
      const relId = column.config.relationColumnId;
      if (!relId) continue;
      const refs = hydrated.refs.get(row.id)?.[relId] ?? [];
      const visibleTargets = refs
        .filter((r) => !r.restricted)
        .map((r) => hydrated.targetData.get(r.rowId))
        .filter((t): t is { tableId: string; data: RowData } => !!t);

      if (column.type === "rollup" && column.config.rollupFn === "count") {
        perColumn[column.id] = visibleTargets.length;
        continue;
      }

      const throughId =
        column.config.lookupColumnId ?? column.config.rollupColumnId;
      const through = throughId ? targetColumnById.get(throughId) : undefined;
      if (!through) continue;

      const values = visibleTargets
        .map((t) => t.data[through.key])
        .filter((v): v is CellValue => v !== undefined);

      if (column.type === "lookup") {
        perColumn[column.id] = values
          .map((v) => cellToText(through, v))
          .filter(Boolean)
          .join(", ");
        continue;
      }

      switch (column.config.rollupFn) {
        case "sum": {
          const nums = values.filter((v): v is number => typeof v === "number");
          perColumn[column.id] = nums.reduce((a, b) => a + b, 0);
          break;
        }
        case "min":
        case "max": {
          const nums = values.filter((v): v is number => typeof v === "number");
          if (nums.length > 0) {
            perColumn[column.id] =
              column.config.rollupFn === "min"
                ? Math.min(...nums)
                : Math.max(...nums);
          }
          break;
        }
        case "join":
        default:
          perColumn[column.id] = values
            .map((v) => cellToText(through, v))
            .filter(Boolean)
            .join(", ");
      }
    }
    if (Object.keys(perColumn).length > 0) result.set(row.id, perColumn);
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
    const sortedDerived = await computeDerivedValues(raw, columns, sortedLinks);
    const sortedContentRefs = await hydrateContentRefs(raw, columns, viewerId);
    const sortedPersonRefs = await hydratePersonRefs(raw, columns, tableId, viewerId);
    return {
      rows: raw.map((r) => ({
        id: r.id,
        tableId: r.tableId,
        sortKey: r.sortKey,
        data: (r.data ?? {}) as RowData,
        links: sortedLinks.refs.get(r.id),
        contentRefs: sortedContentRefs.get(r.id),
        personRefs: sortedPersonRefs.get(r.id),
        derived: sortedDerived.get(r.id),
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
  const pageDerived = await computeDerivedValues(page, columns, pageLinks);
  const pageContentRefs = await hydrateContentRefs(page, columns, viewerId);
  const pagePersonRefs = await hydratePersonRefs(page, columns, tableId, viewerId);

  return {
    rows: page.map((r) => ({
      id: r.id,
      tableId: r.tableId,
      sortKey: r.sortKey,
      data: (r.data ?? {}) as unknown as RowData,
      links: pageLinks.refs.get(r.id),
      contentRefs: pageContentRefs.get(r.id),
      personRefs: pagePersonRefs.get(r.id),
      derived: pageDerived.get(r.id),
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
 *
 * Changed rows carry the SAME hydrated read-model as the page paths (links,
 * contentRefs, personRefs, derived). The client merge replaces rows
 * wholesale, so a leaner payload here would STRIP hydration from any row the
 * poller touches — a person pill would vanish within one poll interval of
 * being assigned (owner report, 2026-08-26).
 */
export async function loadRowChanges(
  tableId: string,
  since: Date,
  viewerId?: string
): Promise<{ changed: DataRow[]; deletedIds: string[] }> {
  const [rawColumns, changed, deleted] = await Promise.all([
    prisma.dataColumn.findMany({
      where: { tableId, deletedAt: null },
      orderBy: { position: "asc" },
    }),
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

  const columns: DataColumn[] = rawColumns.map((c) => ({
    id: c.id,
    key: c.key,
    name: c.name,
    type: c.type,
    position: c.position,
    isPrimary: c.isPrimary,
    config: (c.config ?? {}) as unknown as DataColumnConfig,
    description: c.description,
    deletedAt: null,
  }));

  const links = await hydrateRelationLinks(changed, columns, viewerId);
  const derived = await computeDerivedValues(changed, columns, links);
  const contentRefs = await hydrateContentRefs(changed, columns, viewerId);
  const personRefs = await hydratePersonRefs(changed, columns, tableId, viewerId);

  return {
    changed: changed.map((r) => ({
      id: r.id,
      tableId: r.tableId,
      sortKey: r.sortKey,
      data: (r.data ?? {}) as unknown as RowData,
      links: links.refs.get(r.id),
      contentRefs: contentRefs.get(r.id),
      personRefs: personRefs.get(r.id),
      derived: derived.get(r.id),
      contentId: r.contentId,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
    deletedIds: deleted.map((d) => d.id),
  };
}

/**
 * Specific rows by id, fully hydrated — the property header's fetch
 * (Phase 6a) and the AI tools' row-detail path. Also the missing piece
 * behind ?row= deep links beyond page 1.
 */
export async function loadRowsByIds(
  tableId: string,
  rowIds: string[],
  columns: DataColumn[],
  viewerId?: string
): Promise<DataRow[]> {
  if (rowIds.length === 0) return [];
  const raw = await prisma.dataRow.findMany({
    where: { tableId, id: { in: rowIds.slice(0, 100) }, deletedAt: null },
    select: {
      id: true,
      tableId: true,
      sortKey: true,
      data: true,
      contentId: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (raw.length === 0) return [];
  const links = await hydrateRelationLinks(raw, columns, viewerId);
  const derived = await computeDerivedValues(raw, columns, links);
  const contentRefs = await hydrateContentRefs(raw, columns, viewerId);
  const personRefs = await hydratePersonRefs(raw, columns, tableId, viewerId);
  return raw.map((r) => ({
    id: r.id,
    tableId: r.tableId,
    sortKey: r.sortKey,
    data: (r.data ?? {}) as RowData,
    links: links.refs.get(r.id),
    contentRefs: contentRefs.get(r.id),
    personRefs: personRefs.get(r.id),
    derived: derived.get(r.id),
    contentId: r.contentId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

/** Rows in view order, for exports and the AI query tool. */
export function orderRows(rows: LoadedRow[]): LoadedRow[] {
  return sortByKey(rows);
}
