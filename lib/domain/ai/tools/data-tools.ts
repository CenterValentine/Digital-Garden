/**
 * Database tools — plan Phase 6 (replanned 2026-08-27), SERVER-ONLY.
 *
 * The token contract, enforced here rather than hoped for in prompts:
 * `query_database` returns at most one page unit (default 20, hard max
 * 100 = DEFAULT_ROW_PAGE_SIZE), serialized through `cellToText` into a
 * ~4KB budget with an explicit truncation report — the model learns to
 * NARROW, not to re-query bigger. Rows never ride the mention capsule;
 * these tools are the only row path.
 *
 * Jurisdiction is structural (plan Phase 6): every tool resolves its
 * database through the conversation's associations — a chat scoped to
 * Job Leads cannot reach Contacts, regardless of prompting. Association
 * happens by mention/attachment; sidechat auto-associates.
 *
 * The write tier is append-only `insert_rows` (O3 as amended): it cannot
 * touch existing rows, every cell passes the strict encoder with per-row
 * results, `dedupeBy` makes co-browse itineraries idempotent, and
 * batches over 10 require the model to attest explicit user confirmation
 * (`confirmedByUser`) — v1's stand-in for a proposal card, documented in
 * the plan.
 */

import { tool } from "ai";
import { z } from "zod/v4";
import { prisma } from "@/lib/database/client";
import { logger } from "@/lib/core/logger";
import { canAlterSchema, canWrite } from "@/lib/domain/data/server/access";
import { loadRowPage } from "@/lib/domain/data/server/queries";
import {
  findColumn,
  normalizeCellInput,
  resolveDatabaseRef,
  resolveJurisdiction,
  translateOptionValue,
  writeBlockReason,
} from "@/lib/domain/data/server/resolve";
import { buildDataSchemaDigest } from "@/lib/domain/data/server/digest";
import {
  createRelationTargetCache,
  resolveRelationCell,
  writeRelationLinks,
} from "@/lib/domain/data/server/relation-cells";
import { NEW_TABLE_REF_PREFIX } from "@/lib/domain/data/server/linked-schema";
import {
  createRows,
  writeCells,
  type CellWrite,
} from "@/lib/domain/data/server/mutations";
import { ensureLedgersForMasterRows } from "@/lib/domain/ai/quests";
import {
  AI_PROPOSABLE_COLUMN_TYPES,
  ROLLUP_FNS,
  cellToText,
  deriveRowTitle,
  operatorsForType,
  type CellValue,
  type DataColumn,
  type DataView,
  type FilterCondition,
  type FilterOperator,
} from "@/lib/domain/data";
import type { ToolExecuteContext } from "./types";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const RESULT_BYTE_BUDGET = 4096;
const INSERT_CAP = 25;
const CONFIRM_THRESHOLD = 10;

// ── Proposed-column schema (plan AI-RELATIONAL-DATABASE-REACH P1) ────────
//
// ONE schema for every propose_* tool that describes columns. It used to be
// two hand-copied Zod enums, and when the product gained relations, lookups
// and rollups, neither copy grew: a model asked to link three tables found
// no relation type in its own schema, built the links as hand-typed text ids,
// and filed a feature request asking for what already shipped. The type list
// now comes from `AI_PROPOSABLE_COLUMN_TYPES`, and `ai:drift:check` fails if
// anything here goes back to a literal.

const proposedOption = z.object({
  label: z.string().min(1).max(120),
  color: z.string().optional(),
  group: z.enum(["todo", "active", "done"]).optional(),
});

const proposedColumn = z.object({
  name: z.string().min(1).max(120),
  type: z
    .enum(AI_PROPOSABLE_COLUMN_TYPES)
    .describe(
      "Column type. Money/counts → number; paragraphs → longText; a vocabulary the USER controls → select/multiSelect/status (with options); a link to rows of ANOTHER database → relation (set target); a value read across a relation → lookup; a count/sum over one → rollup; anything free-form → text."
    ),
  description: z
    .string()
    .min(8)
    .max(500)
    .describe(
      "REQUIRED: what goes in this column and where its values come from — this is the model-facing capture context, not decoration."
    ),
  options: z
    .array(proposedOption)
    .max(50)
    .optional()
    .describe(
      "select/multiSelect/status ONLY, and REQUIRED for them: the initial vocabulary."
    ),
  target: z
    .string()
    .max(160)
    .optional()
    .describe(
      "relation ONLY, and REQUIRED for it: the database this column links to — its exact title or id. In propose_linked_databases, use \"$new:<Title>\" for a table in that same proposal."
    ),
  backlinkName: z
    .string()
    .max(120)
    .optional()
    .describe(
      "relation only: what the mirrored column on the TARGET should be called (it appears there automatically). Defaults to this table's name."
    ),
  through: z
    .string()
    .max(120)
    .optional()
    .describe(
      "lookup/rollup ONLY, and REQUIRED for them: the name of the relation column on THIS table to read across."
    ),
  column: z
    .string()
    .max(120)
    .optional()
    .describe(
      "lookup: the column on the target table to show. rollup: the column to aggregate (omit for count)."
    ),
  fn: z
    .enum(ROLLUP_FNS)
    .optional()
    .describe("rollup only: the aggregation. Defaults to count."),
});

type ProposedColumn = z.infer<typeof proposedColumn>;

/**
 * Shape checks the Zod schema cannot express (a relation needs a target, a
 * select needs options). Returns a refusal the tool hands straight back to
 * the model, or null when the column is well-formed.
 */
function checkProposedColumn(column: ProposedColumn): string | null {
  const name = column.name.trim();
  const selectLike =
    column.type === "select" ||
    column.type === "multiSelect" ||
    column.type === "status";
  if (selectLike && (!column.options || column.options.length === 0)) {
    return `"${name}" is a ${column.type} column with NO initial options — an option-less ${column.type} rejects every value written to it. Provide the vocabulary, or make it a text column if the values are free-form.`;
  }
  if (!selectLike && column.options && column.options.length > 0) {
    return `"${name}" is a ${column.type} column — options belong only to select/multiSelect/status.`;
  }
  if (column.type === "relation" && !column.target?.trim()) {
    return `"${name}" is a relation column with no target — name the database it links to.`;
  }
  if (column.type !== "relation" && column.target) {
    return `"${name}" is a ${column.type} column — target belongs only to relation columns.`;
  }
  if (
    (column.type === "lookup" || column.type === "rollup") &&
    !column.through?.trim()
  ) {
    return `"${name}" is a ${column.type} column with no through — name the relation column on this table it reads across.`;
  }
  if (column.type === "lookup" && !column.column?.trim()) {
    return `"${name}" is a lookup with no column — name what it should read on the target table.`;
  }
  if (
    column.type === "rollup" &&
    (column.fn ?? "count") !== "count" &&
    !column.column?.trim()
  ) {
    return `"${name}" is a ${column.fn} rollup with no column — name what it aggregates.`;
  }
  return null;
}


/**
 * Resolve a relation target for a proposal, or return the refusal the model
 * should read. Done at PROPOSE time so a target typo costs a tool result
 * instead of a failed Apply the user has to interpret.
 */
async function resolveRelationTarget(
  ctx: ToolExecuteContext,
  target: string
): Promise<{ id: string; title: string } | string> {
  const ref = target.trim();
  const node = await prisma.contentNode.findFirst({
    where: {
      ownerId: ctx.userId,
      contentType: "data",
      deletedAt: null,
      OR: [{ id: UUID_RE.test(ref) ? ref : undefined }, { title: ref }],
    },
    select: { id: true, title: true },
  });
  if (!node) {
    return `Relation target "${ref}" is not one of the user's databases. Use its exact title (describe_database or the mention capsule shows it), or propose the target table too.`;
  }
  return node;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;



/**
 * The refusal for a spec that draws both directions of one relation, or null
 * when it does not. A relation is two-sided already: proposing "A → B" mints
 * the mirrored column on B, so also proposing "B → A" asks for four columns
 * where two were meant.
 *
 * Mirrors the hard check in `applyLinkedSchema` (which protects every
 * caller); this copy exists so the MODEL is told at propose time, while it
 * can still fix the spec inside the same turn.
 */
function findReciprocalRelation(
  newSides: Array<{ key: string; label: string; columns: ProposedColumn[] }>,
  extendSides: Array<{ key: string; label: string; columns: ProposedColumn[] }>,
  newTitles: Set<string>,
  resolveExisting: (lowerTitle: string) => string | null
): string | null {
  const keyOf = (target: string): string | null => {
    const ref = target.trim();
    const bare = ref.startsWith(NEW_TABLE_REF_PREFIX)
      ? ref.slice(NEW_TABLE_REF_PREFIX.length)
      : ref;
    const lower = bare.toLowerCase();
    if (newTitles.has(lower)) return `new:${lower}`;
    return resolveExisting(lower);
  };

  const seen = new Map<string, { label: string; column: string }>();
  for (const side of [...newSides, ...extendSides]) {
    for (const column of side.columns) {
      if (column.type !== "relation" || !column.target) continue;
      const to = keyOf(column.target);
      // An unresolvable target is another check's job; a self-relation is
      // legitimate (a table pointing at its own rows).
      if (!to || to === side.key) continue;
      const mirror = seen.get(`${to}->${side.key}`);
      if (mirror) {
        return `"${side.label}" and "${mirror.label}" each propose a relation to the other ("${column.name.trim()}" and "${mirror.column}"). A relation is TWO-SIDED — creating one mints the mirrored column on the far table automatically. Keep only one of them, and set its backlinkName to what the other side should be called.`;
      }
      seen.set(`${side.key}->${to}`, {
        label: side.label,
        column: column.name.trim(),
      });
    }
  }
  return null;
}

export interface ProposalPlacement {
  /** Storage folder for the new node. */
  parentId: string | null;
  parentTitle: string | null;
  /**
   * The chat (or content) the new table should be REFERENCED under, when the
   * user's Target-output selection asks for that. Display parentage only —
   * the node still stores in `parentId`, and the user can drag it out.
   */
  ownerContentId: string | null;
  ownerTitle: string | null;
}

/**
 * Where a proposed table should live.
 *
 * The database tools used to read only `targetFolderId`, so a chat whose
 * Target output said "Under this chat" still got its tables as plain
 * siblings — the setting was visible, promised nesting, and was silently
 * ignored (owner report, prod 2026-09-13). They now honor the same
 * precedence the note tools do:
 *
 *   1. an explicitly chosen output FOLDER (plain node there);
 *   2. the output OWNER — nest as a reference under the chat/content;
 *   3. beside the active charter (no root scatter);
 *   4. the chat's target folder.
 *
 * A referenced table stores in its owner's folder, which keeps path and
 * cascade invariants intact and is exactly what the move route expects when
 * the user later drags it somewhere else.
 */
async function resolveProposalPlacement(
  ctx: ToolExecuteContext
): Promise<ProposalPlacement> {
  const empty: ProposalPlacement = {
    parentId: null,
    parentTitle: null,
    ownerContentId: null,
    ownerTitle: null,
  };

  // 1. An explicit folder choice outranks everything below it.
  if (ctx.outputParentOverride) {
    const folder = await prisma.contentNode.findFirst({
      where: { id: ctx.outputParentOverride, ownerId: ctx.userId, deletedAt: null },
      select: { id: true, title: true },
    });
    if (folder) {
      return { ...empty, parentId: folder.id, parentTitle: folder.title };
    }
  }

  // 2. Nest under the chat (or the content the chat is on).
  if (ctx.outputOwnerId) {
    const owner = await prisma.contentNode.findFirst({
      where: { id: ctx.outputOwnerId, ownerId: ctx.userId, deletedAt: null },
      select: { id: true, title: true, parentId: true },
    });
    if (owner) {
      const parent = owner.parentId
        ? await prisma.contentNode.findFirst({
            where: { id: owner.parentId, ownerId: ctx.userId, deletedAt: null },
            select: { id: true, title: true },
          })
        : null;
      return {
        parentId: parent?.id ?? null,
        parentTitle: parent?.title ?? null,
        ownerContentId: owner.id,
        ownerTitle: owner.title,
      };
    }
  }

  // 3/4. Charter folder, else the chat's target folder.
  let parentId: string | null = null;
  if (ctx.activeCharter) {
    const charterNode = await prisma.contentNode.findFirst({
      where: {
        id: ctx.activeCharter.contentId,
        ownerId: ctx.userId,
        deletedAt: null,
      },
      select: { id: true, parentId: true, contentType: true },
    });
    // A folder charter IS the charter's folder (same rule as the quest
    // ledgers in lib/domain/ai/quests.ts).
    parentId = charterNode
      ? charterNode.contentType === "folder"
        ? charterNode.id
        : charterNode.parentId
      : null;
  }
  if (!parentId && ctx.targetFolderId) parentId = ctx.targetFolderId;
  if (!parentId) return empty;
  const parent = await prisma.contentNode.findFirst({
    where: { id: parentId, ownerId: ctx.userId, deletedAt: null },
    select: { id: true, title: true },
  });
  return parent
    ? { ...empty, parentId: parent.id, parentTitle: parent.title }
    : empty;
}

/** The card payload for one proposed column — graph fields only when set. */
function serialiseProposedColumn(column: ProposedColumn) {
  return {
    name: column.name.trim().slice(0, 120),
    type: column.type,
    description: column.description.trim(),
    ...(column.options && column.options.length > 0
      ? {
          options: column.options
            .map((o) => ({
              label: o.label.trim().slice(0, 120),
              ...(o.color && /^[a-z][a-z0-9-]{0,23}$/.test(o.color)
                ? { color: o.color }
                : {}),
              ...(column.type === "status"
                ? { group: o.group ?? ("todo" as const) }
                : {}),
            }))
            .filter((o) => o.label.length > 0),
        }
      : {}),
    ...(column.target ? { target: column.target.trim() } : {}),
    ...(column.backlinkName ? { backlinkName: column.backlinkName.trim() } : {}),
    ...(column.through ? { through: column.through.trim() } : {}),
    ...(column.column ? { column: column.column.trim() } : {}),
    ...(column.type === "rollup" ? { fn: column.fn ?? ("count" as const) } : {}),
  };
}


export function createDataTools(ctx: ToolExecuteContext) {
  return {
    describe_database: tool({
      description:
        "Read an associated database's full schema: columns with types, descriptions, and option vocabularies, plus views and approximate size. Use before querying when the capsule was truncated or you need exact column names. The database must be mentioned in this conversation.",
      inputSchema: z.object({
        databaseId: z
          .string()
          .optional()
          .describe(
            "The database's id or exact name; omit in a chat open on the database"
          ),
      }),
      execute: async ({ databaseId }) => {
        try {
          const dbRef = await resolveDatabaseRef(ctx, databaseId);
          if ("refusal" in dbRef) return dbRef.refusal;
          const gate = await resolveJurisdiction(ctx, dbRef.id);
          if ("refusal" in gate) return gate.refusal;
          const digest = await buildDataSchemaDigest(dbRef.id);
          return digest ?? "This database has no schema yet.";
        } catch (error) {
          logger.warn({
            layer: "ai",
            event: "data_tools:describe_caught",
            summary: "describe_database failed",
            error,
          });
          return "Describing the database failed with an internal error — continue without it and tell the user.";
        }
      },
    }),

    query_database: tool({
      description:
        "Read rows from an associated database, filtered and sorted SERVER-SIDE — never page through everything to find three rows. Returns at most one page (default 20, max 100) of compact text rows plus the total match count; narrow your filters if truncated. Sorted queries return only the top rows (no cursor); unsorted queries return a cursor for deliberate paging. Filter ops by type: text-likes take is/isNot/contains/notContains/startsWith; numbers and dates take is/gt/gte/lt/lte; select/status take is/isNot (option label or id); multiSelect/relation-likes take hasAny/hasAll/hasNone; every column takes isEmpty/isNotEmpty.",
      // Deliberately LENIENT schema (owner failure report, 2026-08-28): a
      // strict shape fails the whole call before execute with an opaque
      // validation error the model can't learn from. Validation lives in
      // execute, where every miss returns a teaching message instead.
      inputSchema: z.object({
        databaseId: z
          .string()
          .optional()
          .describe(
            "The database's id or exact name; omit in a chat open on the database"
          ),
        filters: z
          .union([
            z.array(z.record(z.string(), z.unknown())),
            // A single condition object (weak models skip the array).
            z.record(z.string(), z.unknown()),
          ])
          .optional()
          .describe(
            'ANDed conditions: [{column, op, value?}] — value omitted for isEmpty/isNotEmpty; option labels ok for select-likes'
          ),
        sortBy: z.string().optional().describe("Column name to sort by"),
        sortDirection: z.string().optional().describe("asc or desc"),
        columns: z
          .array(z.string())
          .optional()
          .describe("Column names to return; default primary + first 3"),
        limit: z
          .union([z.number(), z.string()])
          .optional()
          .describe("Rows per page, default 20, max 100"),
        cursorSortKey: z.string().optional(),
        cursorId: z
          .string()
          .optional()
          .describe("Continue from a previous result's cursor"),
      }),
      execute: async (input) => {
        try {
          const dbRef = await resolveDatabaseRef(ctx, input.databaseId);
          if ("refusal" in dbRef) return dbRef.refusal;
          const gate = await resolveJurisdiction(ctx, dbRef.id);
          if ("refusal" in gate) return gate.refusal;
          const databaseId = dbRef.id;
          const { table } = gate;
          const live = table.columns.filter((c) => !c.deletedAt);

          // Compile the model's flat conditions through the ONE filter
          // compiler (plan Phase 2) — no third implementation. Key aliases
          // tolerated (column/field/name, op/operator) — weak models mix
          // them, and a naming slip shouldn't cost a turn.
          const conditions: FilterCondition[] = [];
          const filterList = Array.isArray(input.filters)
            ? input.filters
            : input.filters
              ? [input.filters]
              : [];
          for (const raw of filterList) {
            const f = raw as Record<string, unknown>;
            const columnRef = [f.column, f.field, f.name].find(
              (v): v is string => typeof v === "string"
            );
            const opRef = [f.op, f.operator].find(
              (v): v is string => typeof v === "string"
            );
            if (!columnRef || !opRef) {
              return 'Each filter needs {column, op} (value optional). Example: {"column": "Status", "op": "is", "value": "Done"}.';
            }
            const value = f.value === null ? undefined : f.value;
            const column = findColumn(live, columnRef);
            if (!column) {
              return `No column named "${columnRef}" here. Columns: ${live.map((c) => c.name).join(", ")}.`;
            }
            const allowed = operatorsForType(column.type);
            if (!allowed.includes(opRef as FilterOperator)) {
              return `Operator "${opRef}" does not apply to ${column.name} (${column.type}). Allowed: ${allowed.join(", ")}.`;
            }
            conditions.push({
              columnId: column.id,
              operator: opRef as FilterOperator,
              value: translateOptionValue(column, value) as CellValue,
            });
          }

          let sorts: DataView["sorts"] = [];
          if (input.sortBy) {
            const column = findColumn(live, input.sortBy);
            if (!column) return `No column named "${input.sortBy}" here.`;
            sorts = [
              {
                columnId: column.id,
                direction: input.sortDirection?.toLowerCase().startsWith("desc")
                  ? "desc"
                  : "asc",
              },
            ];
          }

          // Synthetic view: loadRowPage reads only filters/sorts from it.
          const view = {
            filters: { op: "and", children: conditions },
            sorts,
          } as unknown as DataView;

          const requestedLimit =
            typeof input.limit === "string" ? Number(input.limit) : input.limit;
          const limit = Math.min(
            Math.max(
              Number.isFinite(requestedLimit ?? NaN)
                ? (requestedLimit as number)
                : DEFAULT_LIMIT,
              1
            ),
            MAX_LIMIT
          );
          const page = await loadRowPage({
            tableId: databaseId,
            view,
            columns: live,
            cursor:
              input.cursorSortKey && input.cursorId
                ? { sortKey: input.cursorSortKey, id: input.cursorId }
                : null,
            limit,
            viewerId: ctx.userId,
          });

          const primary = live.find((c) => c.isPrimary) ?? live[0];
          const shown =
            input.columns && input.columns.length > 0
              ? input.columns
                  .map((ref) => findColumn(live, ref))
                  .filter((c): c is DataColumn => !!c)
              : live.filter((c) => !c.isPrimary).slice(0, 3);

          const lines: string[] = [];
          let bytes = 0;
          let clipped = 0;
          for (const row of page.rows) {
            const title = deriveRowTitle(live, row.data);
            const rest = shown
              .filter((c) => c.id !== primary?.id)
              .map((c) => {
                const text = cellToText(c, row.data[c.key]);
                return text ? `${c.name}: ${text}` : null;
              })
              .filter(Boolean)
              .join(" · ");
            const line = `- [${row.id}] ${title}${rest ? ` — ${rest}` : ""}`;
            if (bytes + line.length > RESULT_BYTE_BUDGET) {
              clipped = page.rows.length - lines.length;
              break;
            }
            bytes += line.length;
            lines.push(line);
          }

          const header = `${page.total} matching row${page.total === 1 ? "" : "s"}; showing ${lines.length}.`;
          const footer: string[] = [];
          if (clipped > 0) {
            footer.push(
              `[${clipped} fetched rows omitted for size — narrow with filters or request fewer columns.]`
            );
          }
          if (page.nextCursor) {
            footer.push(
              `More rows: pass cursorSortKey="${page.nextCursor.sortKey}" cursorId="${page.nextCursor.id}".`
            );
          } else if (sorts.length > 0 && page.total > lines.length + clipped) {
            footer.push(
              "[Sorted queries return the top rows only — tighten filters to see the rest.]"
            );
          }
          return [header, ...lines, ...footer].join("\n");
        } catch (error) {
          logger.warn({
            layer: "ai",
            event: "data_tools:query_caught",
            summary: "query_database failed",
            error,
          });
          return "Querying the database failed with an internal error — tell the user.";
        }
      },
    }),

    insert_rows: tool({
      description:
        "Append new rows to an associated database. APPEND-ONLY: cannot modify or delete existing rows. Each row is {columnName: value}; select/status/multiSelect accept option labels; dates are ISO strings; file/contentLink cells take arrays of content ids. A RELATION cell takes the linked rows' titles (or row ids from query_database) — one value or an array — and the link is written after the row exists, so you can create a row and link it in the same call; the target row must already exist, and the mirrored column on the other table fills in by itself. Max 25 rows per call; batches over 10 require confirmedByUser: true, which you may set ONLY after the user explicitly approved the batch in conversation. Use dedupeBy with a url column when collecting from the web so re-runs never duplicate rows.",
      inputSchema: z.object({
        databaseId: z
          .string()
          .optional()
          .describe(
            "The database's id or exact name; omit in a chat open on the database"
          ),
        rows: z
          .array(z.record(z.string(), z.unknown()))
          .describe("Rows to append: [{columnName: value, …}]"),
        dedupeBy: z
          .string()
          .optional()
          .describe(
            "Column name — skip rows whose value already exists in it (case-insensitive)"
          ),
        confirmedByUser: z
          .boolean()
          .optional()
          .describe("Required true for more than 10 rows — only after explicit user approval"),
      }),
      execute: async (input) => {
        try {
          const dbRef = await resolveDatabaseRef(ctx, input.databaseId);
          if ("refusal" in dbRef) return dbRef.refusal;
          const gate = await resolveJurisdiction(ctx, dbRef.id);
          if ("refusal" in gate) return gate.refusal;
          const databaseId = dbRef.id;
          const { table, level } = gate;
          if (!canWrite(level)) {
            return "You have read access here but not write — tell the user.";
          }
          if (table.mode === "query") {
            return "Query databases project existing notes — they have no rows to insert. Create notes instead.";
          }
          if (input.rows.length === 0) return "No rows given.";
          if (input.rows.length > INSERT_CAP) {
            return `At most ${INSERT_CAP} rows per call — split the batch.`;
          }
          if (
            input.rows.length > CONFIRM_THRESHOLD &&
            !input.confirmedByUser
          ) {
            return `Batches over ${CONFIRM_THRESHOLD} rows need explicit user approval first. Show the user what you're about to add, get their yes, then retry with confirmedByUser: true.`;
          }

          const live = table.columns.filter((c) => !c.deletedAt);

          // Dedupe against existing values of one column (co-browse
          // idempotency). Design scale (plan D1) makes a full scan fine.
          const seen = new Set<string>();
          let dedupeColumn: DataColumn | undefined;
          if (input.dedupeBy) {
            dedupeColumn = findColumn(live, input.dedupeBy);
            if (!dedupeColumn) {
              return `No column named "${input.dedupeBy}" to dedupe by.`;
            }
            const existing = await prisma.dataRow.findMany({
              where: { tableId: databaseId, deletedAt: null },
              select: { data: true },
            });
            for (const r of existing) {
              const v = ((r.data ?? {}) as Record<string, unknown>)[
                dedupeColumn.key
              ];
              if (typeof v === "string" && v) seen.add(v.trim().toLowerCase());
            }
          }

          // Translate + validate every row BEFORE creating anything, so a
          // bad batch fails whole instead of half-landing.
          const prepared: Array<Record<string, unknown>> = [];
          // Relation cells are resolved per row but written AFTER the row
          // exists — a link needs both ends (plan P4).
          const preparedLinks: Array<
            Array<{ columnId: string; rowIds: string[] }>
          > = [];
          const skipped: string[] = [];
          const errors: string[] = [];
          // One read per target table for the whole batch, not per cell.
          const relationCache = createRelationTargetCache();
          for (let i = 0; i < input.rows.length; i++) {
            const rowInput = input.rows[i];
            const cells: Record<string, unknown> = {};
            const links: Array<{ columnId: string; rowIds: string[] }> = [];
            for (const [ref, raw] of Object.entries(rowInput)) {
              const column = findColumn(live, ref);
              if (!column) {
                errors.push(`Row ${i + 1}: no column named "${ref}".`);
                continue;
              }
              if (column.type === "relation") {
                const resolved = await resolveRelationCell(
                  column,
                  raw,
                  ctx.userId,
                  relationCache
                );
                if ("error" in resolved) {
                  errors.push(`Row ${i + 1}: ${resolved.error}`);
                  continue;
                }
                if (resolved.rowIds.length > 0) {
                  links.push({ columnId: column.id, rowIds: resolved.rowIds });
                }
                continue;
              }
              const blocked = writeBlockReason(column);
              if (blocked) {
                errors.push(`Row ${i + 1}: ${blocked}`);
                continue;
              }
              cells[column.key] = normalizeCellInput(column, raw);
            }
            if (dedupeColumn) {
              const v = cells[dedupeColumn.key];
              if (
                typeof v === "string" &&
                seen.has(v.trim().toLowerCase())
              ) {
                skipped.push(
                  `Row ${i + 1} (${String(v).slice(0, 60)}) — already present`
                );
                continue;
              }
              if (typeof v === "string" && v) seen.add(v.trim().toLowerCase());
            }
            prepared.push(cells);
            preparedLinks.push(links);
          }
          if (errors.length > 0) {
            return `Nothing inserted — fix these first:\n${errors.join("\n")}\nColumns here: ${live.map((c) => c.name).join(", ")}.`;
          }
          if (prepared.length === 0) {
            return `Nothing to insert — all ${input.rows.length} rows were duplicates by ${dedupeColumn?.name}.${skipped.length ? `\nSkipped:\n${skipped.join("\n")}` : ""}`;
          }

          const rowIds = await createRows(
            databaseId,
            live,
            prepared.length,
            ctx.userId
          );
          const writes: CellWrite[] = [];
          rowIds.forEach((rowId, i) => {
            for (const [key, value] of Object.entries(prepared[i])) {
              writes.push({ rowId, columnKey: key, value });
            }
          });
          const result = await writeCells(databaseId, live, writes);
          const failed = result.results.filter((r) => r.status === "error");

          // Links last: the rows they point FROM had to exist first.
          let linksWritten = 0;
          for (const [i, rowId] of rowIds.entries()) {
            for (const link of preparedLinks[i] ?? []) {
              const { added } = await writeRelationLinks(
                link.columnId,
                rowId,
                link.rowIds
              );
              linksWritten += added;
            }
          }
          // Hard rule (quests): named rows inserted into a charter's master
          // ledger are quests the moment they exist — each gets its ledger.
          const questLedgers = await ensureLedgersForMasterRows(
            ctx.userId,
            databaseId,
            rowIds,
          ).catch(() => 0);

          const parts = [
            `Inserted ${rowIds.length} row${rowIds.length === 1 ? "" : "s"}${
              linksWritten > 0
                ? ` and ${linksWritten} link${linksWritten === 1 ? "" : "s"}`
                : ""
            }.`,
          ];
          if (questLedgers > 0) {
            parts.push(
              `${questLedgers} quest ledger${questLedgers === 1 ? "" : "s"} minted under the charter — these rows are quests now; a run proposed with that quest name continues them.`,
            );
          }
          if (skipped.length > 0) {
            parts.push(`Skipped ${skipped.length} duplicate${skipped.length === 1 ? "" : "s"}:\n${skipped.join("\n")}`);
          }
          if (failed.length > 0) {
            parts.push(
              `${failed.length} cell${failed.length === 1 ? "" : "s"} rejected by validation (rows created without them): ${failed
                .slice(0, 5)
                .map((f) => f.message)
                .join("; ")}`
            );
          }
          parts.push(
            "The user can review them in the database grid and delete or edit any of them."
          );
          return parts.join("\n");
        } catch (error) {
          logger.warn({
            layer: "ai",
            event: "data_tools:insert_caught",
            summary: "insert_rows failed",
            error,
          });
          return "Inserting rows failed with an internal error — nothing may have been written; tell the user.";
        }
      },
    }),

    update_row: tool({
      description:
        "Update cells in ONE existing row. Only the columns you pass change — when the user under-specifies, OMIT everything they didn't mention, never guess a value. Pass null to CLEAR a cell, and only when the user asked for it to be blank. Get the rowId from query_database (each result line starts with [rowId]); pass expect with the current values from that same read — a stale expect fails safe instead of overwriting someone's edit, and the result tells you to re-query. All-or-nothing: if any cell is stale or invalid, no cell changes. A RELATION cell takes the linked rows' titles (or their row ids) and REPLACES that cell's links, exactly like writing any other cell — pass the full set you want, and null to unlink everything; this is also how you link two rows that already exist. Computed columns (lookup, rollup) have no stored value and cannot be written, and this tool cannot create or delete rows. File cells accept ONLY ids of file nodes (uploaded attachments, or files you created with a file tool) — other content belongs in a contentLink cell; to attach something from the user's disk, ask them to upload via the cell's + first.",
      inputSchema: z.object({
        databaseId: z
          .string()
          .optional()
          .describe(
            "The database's id or exact name; omit in a chat open on the database"
          ),
        rowId: z
          .string()
          .describe("The row to update — from a query_database result line"),
        cells: z
          .record(z.string(), z.union([
            z.string(),
            z.number(),
            z.boolean(),
            z.array(z.string()),
            z.null(),
          ]))
          .describe(
            "ONLY the columns to change: {columnName: newValue}. null clears the cell (user-requested blanks only). Option labels ok for select-likes; dates ISO (M/D/YYYY tolerated)."
          ),
        expect: z
          .record(z.string(), z.union([
            z.string(),
            z.number(),
            z.boolean(),
            z.array(z.string()),
            z.null(),
          ]))
          .optional()
          .describe(
            "Current values you last read, per column you're changing (null = you believe it's empty). Strongly recommended: protects the user's concurrent edits."
          ),
      }),
      execute: async (input) => {
        try {
          const dbRef = await resolveDatabaseRef(ctx, input.databaseId);
          if ("refusal" in dbRef) return dbRef.refusal;
          const gate = await resolveJurisdiction(ctx, dbRef.id);
          if ("refusal" in gate) return gate.refusal;
          const databaseId = dbRef.id;
          const { table, level } = gate;
          if (!canWrite(level)) {
            return "You have read access here but not write — tell the user.";
          }
          if (table.mode === "query") {
            return "Query databases project existing notes — edit the note itself, not rows.";
          }
          const live = table.columns.filter((c) => !c.deletedAt);

          const entries = Object.entries(input.cells);
          if (entries.length === 0) return "No cells given — nothing to change.";
          if (entries.length > 10) {
            return "At most 10 cells per update — split it, or reconsider whether this is really one edit.";
          }

          const writes: CellWrite[] = [];
          const errors: string[] = [];
          // Relation cells are written as links after the cell writes land,
          // so an all-or-nothing cell failure still leaves links untouched.
          const relationWrites: Array<{ columnId: string; rowIds: string[] }> =
            [];
          for (const [ref, raw] of entries) {
            const column = findColumn(live, ref);
            if (!column) {
              errors.push(`No column named "${ref}".`);
              continue;
            }
            if (column.type === "relation") {
              const resolved = await resolveRelationCell(
                column,
                raw === null || raw === "" ? [] : raw,
                ctx.userId
              );
              if ("error" in resolved) {
                errors.push(resolved.error);
                continue;
              }
              relationWrites.push({
                columnId: column.id,
                rowIds: resolved.rowIds,
              });
              continue;
            }
            const blocked = writeBlockReason(column);
            if (blocked) {
              errors.push(blocked);
              continue;
            }
            // null / "" = clear (empty-is-absent, plan B8c): the key is
            // deleted, exactly what the grid does.
            const value =
              raw === null || raw === ""
                ? undefined
                : normalizeCellInput(column, raw);
            const write: CellWrite = {
              rowId: input.rowId,
              columnKey: column.key,
              value,
            };
            if (input.expect && ref in input.expect) {
              const rawExpect = input.expect[ref];
              write.expect = (
                rawExpect === null || rawExpect === ""
                  ? undefined
                  : normalizeCellInput(column, rawExpect)
              ) as CellWrite["expect"];
              write.hasExpectation = true;
            }
            writes.push(write);
          }
          if (errors.length > 0) {
            return `Nothing updated — fix these first:\n${errors.join("\n")}\nColumns here: ${live.map((c) => c.name).join(", ")}.`;
          }

          const result = await writeCells(databaseId, live, writes);
          const stale = result.results.filter((r) => r.status === "stale");
          if (stale.length > 0) {
            const details = stale
              .map((s) => {
                const col = live.find((c) => c.key === s.columnKey);
                const current = col
                  ? cellToText(col, s.current) || "(empty)"
                  : String(s.current ?? "(empty)");
                return `${col?.name ?? s.columnKey} is now: ${current}`;
              })
              .join("; ");
            return `Not updated — the row changed since you read it (${details}). Re-query and retry with fresh expect values, or ask the user which value should win.`;
          }
          const failed = result.results.filter((r) => r.status === "error");
          if (failed.length > 0) {
            return `Not updated — validation rejected: ${failed
              .map((f) => f.message)
              .join("; ")}. Nothing changed (all-or-nothing).`;
          }
          // Links last, and only once every cell write succeeded.
          // A relation cell REPLACES the row's links for that column, the
          // way writing any other cell replaces its value.
          let added = 0;
          let removed = 0;
          for (const link of relationWrites) {
            const delta = await writeRelationLinks(
              link.columnId,
              input.rowId,
              link.rowIds
            );
            added += delta.added;
            removed += delta.removed;
          }

          // Hard rule (quests): naming a master-ledger row makes it a quest.
          const questLedgers = await ensureLedgersForMasterRows(
            ctx.userId,
            databaseId,
            [input.rowId],
          ).catch(() => 0);
          const cellPart =
            writes.length > 0
              ? `Updated ${writes.length} cell${writes.length === 1 ? "" : "s"} on the row.`
              : "Updated the row.";
          const linkPart =
            added > 0 || removed > 0
              ? ` Links: ${added} added, ${removed} removed.`
              : "";
          return `${cellPart}${linkPart}${questLedgers > 0 ? " The row is a quest now — its quest ledger was minted under the charter." : ""} The user sees the change in the grid and can undo it there.`;
        } catch (error) {
          logger.warn({
            layer: "ai",
            event: "data_tools:update_caught",
            summary: "update_row failed",
            error,
          });
          return "Updating the row failed with an internal error — nothing may have been written; tell the user.";
        }
      },
    }),

    // ─── propose_column_options ─────────────────────────────
    // Proposal, not a write: the sentinel renders as an interactive card
    // (ColumnOptionsProposalCard) and the USER's Apply click does the
    // columns PATCH — same contract as the flashcards propose_* tools.
    // Validation still happens here so the card never renders something
    // that would fail on apply.
    propose_column_options: tool({
      description:
        "Propose a set of options (categories) for a select, multi-select, or status column in an associated database. Renders a review card — NOTHING is written until the user clicks Apply, so never claim the options were added. Use when a column has no options yet or the user asks for category suggestions; consider query_database first so proposals reflect the values actually in the table. Once you call this, stop — the card in the chat is the confirmation.",
      inputSchema: z.object({
        databaseId: z
          .string()
          .optional()
          .describe(
            "The database's id or exact name; omit in a chat open on the database"
          ),
        column: z
          .string()
          .describe(
            "The target column — its name (case-insensitive) or id. Must be a select, multiSelect, or status column."
          ),
        options: z
          .array(
            z.object({
              label: z.string().describe("The option's display label"),
              color: z
                .string()
                .optional()
                .describe(
                  "Optional color intent name (e.g. blue, green, amber, red)"
                ),
              group: z
                .enum(["todo", "active", "done"])
                .optional()
                .describe("Status columns only: which board group"),
            })
          )
          .describe("The proposed options, in display order (at most 50)"),
        replace: z
          .boolean()
          .optional()
          .describe(
            "true = propose REPLACING the existing options (removed options blank their cells without erasing data); default adds to them"
          ),
        rationale: z
          .string()
          .optional()
          .describe("One sentence on why these options fit — shown on the card"),
      }),
      execute: async (input) => {
        try {
          const dbRef = await resolveDatabaseRef(ctx, input.databaseId);
          if ("refusal" in dbRef) return dbRef.refusal;
          const gate = await resolveJurisdiction(ctx, dbRef.id);
          if ("refusal" in gate) return gate.refusal;
          const { table, level } = gate;
          if (table.mode === "query") {
            return "Query databases synthesize their columns — there are no options to configure.";
          }
          // Schema access is stricter than cell writes (plan Phase 6); the
          // Apply PATCH would 403, so teach that now instead of rendering a
          // dead card.
          if (!canAlterSchema(level)) {
            return "Only this database's owner can change column options — tell the user, and suggest they ask the owner.";
          }

          const live = table.columns.filter((c) => !c.deletedAt);
          const column = findColumn(live, input.column);
          if (!column) {
            return `No column named "${input.column}". Columns here: ${live.map((c) => c.name).join(", ")}.`;
          }
          // Charter-ledger machinery columns: the quest code writes option
          // ids it minted, so their vocabularies are locked (the Apply PATCH
          // would be refused anyway — teach it now, not after a dead card).
          if (column.config?.system === true) {
            return `"${column.name}" is a SYSTEM column of a charter ledger — its options are written by the quest machinery and are locked. Propose a NEW column for a user-controlled vocabulary instead (propose_database_columns).`;
          }
          if (
            column.type !== "select" &&
            column.type !== "multiSelect" &&
            column.type !== "status"
          ) {
            const selectLikes = live.filter(
              (c) =>
                c.type === "select" ||
                c.type === "multiSelect" ||
                c.type === "status"
            );
            return `"${column.name}" is a ${column.type} column — options belong to select, multi-select, and status columns${
              selectLikes.length > 0
                ? ` (here: ${selectLikes.map((c) => c.name).join(", ")})`
                : " (this table has none)"
            }.`;
          }

          if (input.options.length === 0) {
            return "No options given — propose at least one.";
          }
          if (input.options.length > 50) {
            return "At most 50 options per proposal — a longer vocabulary than that is usually a sign the column wants free text instead.";
          }

          const existing = column.config.options ?? [];
          const existingLower = new Set(
            existing.map((o) => o.label.trim().toLowerCase())
          );
          const replace = input.replace === true;
          const seen = new Set<string>();
          const cleaned: Array<{
            label: string;
            color?: string;
            group?: "todo" | "active" | "done";
          }> = [];
          const skippedExisting: string[] = [];
          for (const raw of input.options) {
            const label = raw.label.trim().slice(0, 120);
            if (!label) continue;
            const lower = label.toLowerCase();
            if (seen.has(lower)) continue;
            seen.add(lower);
            // Add-mode duplicates are reported, not silently dropped by the
            // card — the model should learn the vocabulary already exists.
            if (!replace && existingLower.has(lower)) {
              skippedExisting.push(label);
              continue;
            }
            cleaned.push({
              label,
              // Color intents are free-form tokens for the renderer; keep
              // only slug-shaped values so junk never reaches config.
              ...(raw.color && /^[a-z][a-z0-9-]{0,23}$/.test(raw.color)
                ? { color: raw.color }
                : {}),
              ...(column.type === "status"
                ? { group: raw.group ?? "todo" }
                : {}),
            });
          }

          if (cleaned.length === 0) {
            return skippedExisting.length > 0
              ? `Every proposed option already exists on "${column.name}" (${skippedExisting.join(", ")}) — nothing to propose.`
              : "No usable options after cleaning (blank labels) — propose real labels.";
          }

          return JSON.stringify({
            __columnOptionsProposal: true,
            databaseId: dbRef.id,
            databaseTitle: table.title,
            columnId: column.id,
            columnName: column.name,
            columnType: column.type,
            replace,
            rationale: input.rationale?.trim() || null,
            options: cleaned,
            existingLabels: existing.map((o) => o.label),
            skippedExisting,
          });
        } catch (error) {
          logger.warn({
            layer: "ai",
            event: "data_tools:propose_options_caught",
            summary: "propose_column_options failed",
            error,
          });
          return "Proposing options failed with an internal error — nothing was changed; tell the user.";
        }
      },
    }),
    // ─── propose_database_columns ───────────────────────────
    // D3 (owner report 2026-09-10). The toolkit could read a database,
    // write its cells, and mint a whole new one — but it could not add a
    // column to a table that already existed. "Update the charter database
    // to ensure it has these 26 columns" was, until now, unanswerable by
    // construction; the model could only discover that after spending its
    // whole step budget.
    //
    // Deliberately ADD-ONLY. Rename/retype/remove are a different risk
    // class: a retype can invalidate every cell in a column and a remove
    // hides data, so those stay a human action in the grid. Adding a column
    // cannot damage an existing row — it only widens the shape.
    //
    // Proposal, not a write: the sentinel renders as
    // DatabaseColumnsProposalCard and the USER's Apply click POSTs each
    // column. Same contract as every other propose_* tool.
    propose_database_columns: tool({
      description:
        "Propose NEW columns for an EXISTING database — the way to answer \"make sure this database has these fields\". Renders a review card; NOTHING is written until the user clicks Apply, so never claim the columns exist. Add-only by design: it cannot rename, retype, or delete a column (those stay the user's own action in the grid — say so if asked). Call describe_database first; columns the table already has are reported as present and dropped from the proposal, so propose the FULL wanted set and let the diff sort it out. Every column needs a real description (what goes in it, where values come from), and select/multiSelect/status need their initial options or they reject every value. This is also how a table gains a LINK to another one: propose a relation column with `target` set to that database's exact title — its mirrored column appears there automatically. When the table to link to does not exist yet, use propose_linked_databases instead.",
      inputSchema: z.object({
        databaseId: z
          .string()
          .optional()
          .describe(
            "The database's id or exact name; omit in a chat open on the database"
          ),
        columns: z
          .array(proposedColumn)
          .min(1)
          .max(30)
          .describe("The columns you want the database to have, in display order."),
        rationale: z
          .string()
          .max(300)
          .optional()
          .describe("One sentence on why these fit — shown on the card."),
      }),
      execute: async (input) => {
        try {
          const dbRef = await resolveDatabaseRef(ctx, input.databaseId);
          if ("refusal" in dbRef) return dbRef.refusal;
          const gate = await resolveJurisdiction(ctx, dbRef.id);
          if ("refusal" in gate) return gate.refusal;
          const { table, level } = gate;
          if (table.mode === "query") {
            return "Query databases synthesize their columns from the query — they have no schema to extend.";
          }
          // Schema access is stricter than cell writes; the Apply POST would
          // 403, so teach that now instead of rendering a dead card.
          if (!canAlterSchema(level)) {
            return "Only this database's owner can add columns — tell the user, and suggest they ask the owner.";
          }

          const live = table.columns.filter((c) => !c.deletedAt);
          const liveLower = new Map(
            live.map((c) => [c.name.trim().toLowerCase(), c])
          );

          // The "ensure it has" diff: a column the table already has is
          // reported as present, never re-proposed. This is what lets the
          // model send the whole wanted schema without checking first.
          const alreadyPresent: string[] = [];
          const seen = new Set<string>();
          const additions: Array<{
            name: string;
            type: string;
            description: string;
            options?: Array<{
              label: string;
              color?: string;
              group?: "todo" | "active" | "done";
            }>;
          }> = [];

          for (const raw of input.columns) {
            const name = raw.name.trim().slice(0, 120);
            if (!name) continue;
            const lower = name.toLowerCase();
            if (seen.has(lower)) {
              return `Duplicate column name "${name}" in the proposal — every column needs a distinct name.`;
            }
            seen.add(lower);
            const existing = liveLower.get(lower);
            if (existing) {
              alreadyPresent.push(
                existing.type === raw.type
                  ? name
                  : `${name} (exists as ${existing.type}, you asked for ${raw.type})`
              );
              continue;
            }
            const problem = checkProposedColumn(raw);
            if (problem) return problem;
            if (raw.target?.startsWith(NEW_TABLE_REF_PREFIX)) {
              return `"${name}" targets ${raw.target}, but this tool only adds columns to a table that already exists. Use propose_linked_databases to create the target alongside it.`;
            }
            if (raw.type === "relation") {
              const target = await resolveRelationTarget(ctx, raw.target!);
              if (typeof target === "string") return target;
            }
            // A lookup/rollup must read through a relation that exists on
            // this table or arrives in this same proposal — checked here so
            // the model fixes it now instead of on a failed Apply.
            if (raw.type === "lookup" || raw.type === "rollup") {
              const through = raw.through!.trim().toLowerCase();
              const inProposal = input.columns.some(
                (c) => c.type === "relation" && c.name.trim().toLowerCase() === through
              );
              const onTable = live.some(
                (c) => c.type === "relation" && c.name.trim().toLowerCase() === through
              );
              if (!inProposal && !onTable) {
                return `"${name}" reads through "${raw.through}", which is not a relation column on "${table.title}" and is not in this proposal. Propose the relation too, or point at an existing one.`;
              }
            }
            additions.push(serialiseProposedColumn(raw));
          }

          // Nothing to do is an ANSWER, not an error — and a valuable one:
          // "the database already has everything you asked for" is exactly
          // what the user wanted to know. Returning text (not a card) keeps
          // the model from claiming it changed anything.
          if (additions.length === 0) {
            return (
              `"${table.title}" already has every column you listed` +
              (alreadyPresent.length > 0
                ? `: ${alreadyPresent.join(", ")}. `
                : ". ") +
              "Nothing to add — tell the user the schema is already complete. " +
              "Renaming, retyping, or removing a column is not something you can do; that is theirs to do in the grid."
            );
          }

          return JSON.stringify({
            __databaseColumnsProposal: true,
            databaseId: dbRef.id,
            databaseTitle: table.title,
            rationale: input.rationale?.trim() || null,
            columns: additions,
            alreadyPresent,
            existingCount: live.length,
          });
        } catch (error) {
          logger.warn({
            layer: "ai",
            event: "data_tools:propose_columns_caught",
            summary: "propose_database_columns failed",
            error,
          });
          return "Proposing the columns failed with an internal error — nothing was changed; tell the user.";
        }
      },
    }),
    // ─── propose_output_database ────────────────────────────
    // P5 (EXTRACTION-TO-DATABASE-PLAN §3.7, D1 reversed): the AI structures
    // the output database — schema derived from the charter's objective,
    // with an AI-written description on EVERY column (the load-bearing
    // capture context of §3.1) and initial vocabularies inline. Proposal,
    // not a write: the sentinel renders as OutputDatabaseProposalCard and
    // the USER's Apply click creates the table (POST /api/content/data).
    propose_output_database: tool({
      description:
        "Propose ONE new database for capturing results when no suitable table exists (or the user asks for one). Renders a review card — NOTHING is created until the user clicks Apply, so never claim the database exists. Derive the schema from the run's objective and write a real description on EVERY column (what goes in it, where values come from) — descriptions are the capture mapping context. Type rule: select/status ONLY for vocabularies the user controls (pipeline stages, your own categories) and ALWAYS with initial options; text for anything the web invents (titles, companies, locations); a relation (with `target`) to point at rows of a database that ALREADY exists — never a text column of ids standing in for a link. Include a url column when items have pages — it becomes the dedupe identity. Prefer binding to an EXISTING table when one fits; propose creation only when none does. If the user wants SEVERAL tables that reference each other, use propose_linked_databases — this tool creates one. After the user applies, bind the new table via captureTo in propose_item_iteration.",
      inputSchema: z.object({
        title: z
          .string()
          .min(1)
          .max(120)
          .describe("The database's name (e.g. \"Job Leads\")."),
        purpose: z
          .string()
          .max(300)
          .optional()
          .describe("One sentence on what this table captures — shown on the card."),
        columns: z
          .array(
            proposedColumn.extend({
              primary: z
                .boolean()
                .optional()
                .describe("Mark exactly ONE column as the primary (the row's title — usually the item's name/title column)."),
            }),
          )
          .min(1)
          // Mirrors the create route's cap (app/api/content/data POST rejects
          // more than 30). A lower cap here forced a lossy consolidation of a
          // 26-column spec for no reason (prod, 2026-09-11).
          .max(30)
          .describe("The schema, in display order."),
        dedupeColumn: z
          .string()
          .max(120)
          .optional()
          .describe("Which column holds each item's stable identity (defaults to the first url column)."),
      }),
      execute: async (input) => {
        try {
          const seen = new Set<string>();
          const columns = [];
          for (const raw of input.columns) {
            const name = raw.name.trim();
            if (!name) continue;
            const lower = name.toLowerCase();
            if (seen.has(lower)) {
              return `Duplicate column name "${name}" — every column needs a distinct name.`;
            }
            seen.add(lower);
            const problem = checkProposedColumn(raw);
            if (problem) return problem;
            // A single new table cannot host a `$new:` reference — there is
            // no sibling in this proposal to point at.
            if (raw.target?.startsWith(NEW_TABLE_REF_PREFIX)) {
              return `"${name}" targets ${raw.target}, but this tool creates ONE table. Use propose_linked_databases to create tables that reference each other.`;
            }
            if (raw.type === "relation") {
              const target = await resolveRelationTarget(ctx, raw.target!);
              if (typeof target === "string") return target;
            }
            columns.push({
              ...serialiseProposedColumn(raw),
              ...(raw.primary ? { primary: true } : {}),
            });
          }
          if (columns.length === 0) {
            return "No usable columns after cleaning — propose real column names.";
          }
          const primaries = columns.filter((c) => c.primary);
          if (primaries.length > 1) {
            return `Only one column can be primary (got: ${primaries.map((c) => c.name).join(", ")}).`;
          }
          if (primaries.length === 0) {
            // Default: first text column, else the first column.
            const firstText = columns.find((c) => c.type === "text");
            (firstText ?? columns[0]).primary = true;
          }
          if (input.dedupeColumn) {
            const match = columns.find(
              (c) => c.name.toLowerCase() === input.dedupeColumn!.trim().toLowerCase(),
            );
            if (!match) {
              return `dedupeColumn "${input.dedupeColumn}" is not one of the proposed columns.`;
            }
          }
          const placement = await resolveProposalPlacement(ctx);
          const parentId = placement.parentId;
          const parentTitle = placement.parentTitle;
          return JSON.stringify({
            __outputDatabaseProposal: true,
            title: input.title.trim().slice(0, 120),
            purpose: input.purpose?.trim() || null,
            columns,
            dedupeColumn:
              input.dedupeColumn?.trim() ||
              columns.find((c) => c.type === "url")?.name ||
              null,
            parentId,
            parentTitle,
            ownerContentId: placement.ownerContentId,
            ownerTitle: placement.ownerTitle,
          });
        } catch (error) {
          logger.warn({
            layer: "ai",
            event: "data_tools:propose_output_db_caught",
            summary: "propose_output_database failed",
            error,
          });
          return "Proposing the database failed with an internal error — nothing was created; tell the user.";
        }
      },
    }),
    // ─── propose_linked_databases ───────────────────────────
    // P2 (plan AI-RELATIONAL-DATABASE-REACH). Origin: a production session
    // asked for three tables that reference each other. The model could only
    // answer with four independent proposal cards — three tables plus a
    // column addition — so nothing could point at anything, and it fell back
    // to hand-typed text ids (EXP-012) for every link.
    //
    // A linked schema is one decision, so it is one card and one transaction.
    // Deliberately a SEPARATE tool from propose_output_database: that tool's
    // one-table contract is named in several prompts and by the capture flow,
    // and widening it would change what every one of those already means.
    propose_linked_databases: tool({
      description:
        "Propose a SET of databases that reference each other — the way to answer \"build these tables and link them\". Renders ONE review card; nothing is created until the user clicks Apply, which creates every table, relation and rollup in a single transaction (all of it, or none). Use this whenever two or more tables need to point at each other, or when a table the user ALREADY has should link to new ones — put that one in `extend` rather than rebuilding it as an index of the others. Inside `tables`, a relation targets a sibling with \"$new:<Title>\"; anywhere, it targets an existing database by exact title. Relations are two-sided: the mirrored column appears on the target automatically, so never propose both halves. NEVER invent text \"ID\" columns to stand in for links.",
      inputSchema: z.object({
        tables: z
          .array(
            z.object({
              title: z.string().min(1).max(120),
              purpose: z
                .string()
                .max(300)
                .optional()
                .describe("One sentence on what this table holds — shown on the card and kept as its description."),
              columns: z
                .array(
                  proposedColumn.extend({
                    primary: z
                      .boolean()
                      .optional()
                      .describe("Mark exactly ONE column as the primary (the row's title)."),
                  }),
                )
                .min(1)
                .max(30),
            }),
          )
          .max(6)
          .optional()
          .describe("New tables to create, in order. Omit when you are only linking tables that already exist."),
        extend: z
          .array(
            z.object({
              database: z
                .string()
                .min(1)
                .max(160)
                .describe("An EXISTING database — its exact title or id."),
              columns: z
                .array(proposedColumn)
                .min(1)
                .max(30)
                .describe("Columns to ADD to it — usually the relation(s) joining it to the new tables."),
            }),
          )
          .max(6)
          .optional()
          .describe("Tables the user already has that should join this set. Add-only: this never renames, retypes, or removes a column."),
        rationale: z
          .string()
          .max(300)
          .optional()
          .describe("One sentence on how these fit together — shown on the card."),
      }),
      execute: async (input) => {
        try {
          const tables = input.tables ?? [];
          const extend = input.extend ?? [];
          if (tables.length === 0 && extend.length === 0) {
            return "Nothing proposed — give at least one new table, or one existing database to extend.";
          }

          const newTitles = tables.map((t) => t.title.trim());
          const newTitleSet = new Set(newTitles.map((t) => t.toLowerCase()));
          if (newTitleSet.size !== newTitles.length) {
            return "Two proposed tables share a title — each needs a distinct one, since relations address them by name.";
          }

          // Resolve every existing database ONCE: the extend targets, and
          // every relation target that is not a sibling in this proposal.
          const extendTargets: Array<{ id: string; title: string; columns: unknown[] }> = [];
          for (const entry of extend) {
            const dbRef = await resolveDatabaseRef(ctx, entry.database);
            if ("refusal" in dbRef) return dbRef.refusal;
            const gate = await resolveJurisdiction(ctx, dbRef.id);
            if ("refusal" in gate) return gate.refusal;
            if (gate.table.mode === "query") {
              return `"${gate.table.title}" is a query database — it synthesizes its columns from the query and has no schema to extend.`;
            }
            if (!canAlterSchema(gate.level)) {
              return `Only "${gate.table.title}"'s owner can add columns to it — tell the user, and suggest they ask the owner.`;
            }
            extendTargets.push({
              id: dbRef.id,
              title: gate.table.title,
              columns: [],
            });
          }

          // Validate every column of every table, new and extended.
          const specs: Array<{
            label: string;
            columns: ProposedColumn[];
            relationNames: Set<string>;
          }> = [
            ...tables.map((t) => ({
              label: t.title.trim(),
              columns: t.columns as ProposedColumn[],
              relationNames: new Set<string>(),
            })),
            ...extend.map((e, i) => ({
              label: extendTargets[i].title,
              columns: e.columns as ProposedColumn[],
              relationNames: new Set<string>(),
            })),
          ];

          for (const spec of specs) {
            const seen = new Set<string>();
            for (const column of spec.columns) {
              const name = column.name.trim();
              const lower = name.toLowerCase();
              if (seen.has(lower)) {
                return `"${spec.label}" proposes two columns called "${name}" — every column needs a distinct name.`;
              }
              seen.add(lower);
              const problem = checkProposedColumn(column);
              if (problem) return `"${spec.label}": ${problem}`;
              if (column.type === "relation") {
                spec.relationNames.add(lower);
                const target = column.target!.trim();
                if (target.startsWith(NEW_TABLE_REF_PREFIX)) {
                  const wanted = target.slice(NEW_TABLE_REF_PREFIX.length).toLowerCase();
                  if (!newTitleSet.has(wanted)) {
                    return `"${spec.label}": relation "${name}" targets ${target}, but no table in this proposal is called "${target.slice(NEW_TABLE_REF_PREFIX.length)}".`;
                  }
                } else if (!newTitleSet.has(target.toLowerCase())) {
                  const resolved = await resolveRelationTarget(ctx, target);
                  if (typeof resolved === "string") {
                    return `"${spec.label}": ${resolved}`;
                  }
                }
              }
            }
            // Lookups and rollups resolve against this table's relations —
            // the ones proposed here, plus (for an extended table) any it
            // already has. Checked now so Apply cannot fail on a typo.
            for (const column of spec.columns) {
              if (column.type !== "lookup" && column.type !== "rollup") continue;
              const through = column.through!.trim().toLowerCase();
              if (spec.relationNames.has(through)) continue;
              const existing = extendTargets.find((t) => t.title === spec.label);
              const live = existing
                ? await prisma.dataColumn.findFirst({
                    where: {
                      tableId: existing.id,
                      type: "relation",
                      deletedAt: null,
                      name: column.through!.trim(),
                    },
                    select: { id: true },
                  })
                : null;
              if (!live) {
                return `"${spec.label}": ${column.type} "${column.name}" reads through "${column.through}", which is not a relation column there or in this proposal.`;
              }
            }
          }

          // Both halves of the same relation is the mistake a model makes
          // here (prod 2026-09-12: all six directions between three tables).
          // A relation already mints its mirror on the far side, so the spec
          // would describe four columns where two were meant, with the
          // duplicates colliding into "Sources 2". Caught at PROPOSE time so
          // the model fixes it now, not on the user's failed Apply.
          const reciprocal = findReciprocalRelation(
            tables.map((t, i) => ({
              key: `new:${newTitles[i].toLowerCase()}`,
              label: newTitles[i],
              columns: t.columns as ProposedColumn[],
            })),
            extend.map((e, i) => ({
              key: `id:${extendTargets[i].id}`,
              label: extendTargets[i].title,
              columns: e.columns as ProposedColumn[],
            })),
            newTitleSet,
            (title) => {
              const match = extendTargets.find(
                (t) => t.title.toLowerCase() === title
              );
              return match ? `id:${match.id}` : null;
            }
          );
          if (reciprocal) return reciprocal;

          // Placement: the shared rule — an explicit output folder, else
          // nested under the chat/content, else beside the charter, else the
          // chat's target folder. Never root.
          const placement = await resolveProposalPlacement(ctx);

          return JSON.stringify({
            __linkedDatabasesProposal: true,
            rationale: input.rationale?.trim() || null,
            parentId: placement.parentId,
            parentTitle: placement.parentTitle,
            ownerContentId: placement.ownerContentId,
            ownerTitle: placement.ownerTitle,
            tables: tables.map((t) => ({
              title: t.title.trim().slice(0, 120),
              purpose: t.purpose?.trim() || null,
              columns: (t.columns as Array<ProposedColumn & { primary?: boolean }>).map(
                (c) => ({
                  ...serialiseProposedColumn(c),
                  ...(c.primary ? { primary: true } : {}),
                }),
              ),
            })),
            extend: extend.map((e, i) => ({
              databaseId: extendTargets[i].id,
              databaseTitle: extendTargets[i].title,
              columns: (e.columns as ProposedColumn[]).map(serialiseProposedColumn),
            })),
          });
        } catch (error) {
          logger.warn({
            layer: "ai",
            event: "data_tools:propose_linked_dbs_caught",
            summary: "propose_linked_databases failed",
            error,
          });
          return "Proposing the linked schema failed with an internal error — nothing was created; tell the user.";
        }
      },
    }),
  };
}
