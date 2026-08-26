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
import {
  canRead,
  canWrite,
  resolveDataTableAccess,
} from "@/lib/domain/data/server/access";
import { loadRowPage, loadTable } from "@/lib/domain/data/server/queries";
import { buildDataSchemaDigest } from "@/lib/domain/data/server/digest";
import {
  createRows,
  writeCells,
  type CellWrite,
} from "@/lib/domain/data/server/mutations";
import {
  cellToText,
  deriveRowTitle,
  operatorsForType,
  type CellValue,
  type DataColumn,
  type DataTable,
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

/**
 * Structural jurisdiction: the database must be associated with THIS
 * conversation, and the user must be able to read it. Returns the loaded
 * table or a model-facing refusal string.
 */
async function resolveJurisdiction(
  ctx: ToolExecuteContext,
  databaseId: string
): Promise<
  | { table: DataTable; level: Awaited<ReturnType<typeof resolveDataTableAccess>> }
  | { refusal: string }
> {
  // The chat being OPEN ON this database is the strongest association
  // there is — sidechat binding (plan Phase 6) needs no
  // ConversationAssociation row to prove what ctx.contentId already states.
  const boundHere = ctx.contentId === databaseId;
  if (!boundHere) {
    if (!ctx.conversationId) {
      return {
        refusal:
          "This chat has no bound conversation, so database tools are unavailable. Ask the user to mention the database in a saved conversation.",
      };
    }
    const assoc = await prisma.conversationAssociation.findFirst({
      where: { conversationId: ctx.conversationId, contentNodeId: databaseId },
      select: { conversationId: true },
    });
    if (!assoc) {
      return {
        refusal:
          "That database is not associated with this conversation — tools reach only associated databases by design. Ask the user to @-mention it (or open the chat from the database) first.",
      };
    }
  }
  const level = await resolveDataTableAccess(databaseId, ctx.userId);
  if (!canRead(level)) return { refusal: "Database not found." };
  const table = await loadTable(databaseId, ctx.userId);
  if (!table) return { refusal: "Database not found." };
  return { table, level };
}

/** Column lookup by name (case-insensitive), key, or id. */
function findColumn(
  columns: DataColumn[],
  ref: string
): DataColumn | undefined {
  const lower = ref.trim().toLowerCase();
  return (
    columns.find((c) => c.id === ref || c.key === ref) ??
    columns.find((c) => c.name.toLowerCase() === lower)
  );
}

/**
 * Model ergonomics: select/status cells store option IDS (plan D3), but a
 * model naturally speaks in labels. Accept either; translate labels to ids
 * before the strict encoder sees them.
 */
function translateOptionValue(
  column: DataColumn,
  value: unknown
): unknown {
  const options = column.config.options ?? [];
  const toId = (v: unknown): unknown => {
    if (typeof v !== "string") return v;
    if (options.some((o) => o.id === v)) return v;
    const byLabel = options.find(
      (o) => o.label.toLowerCase() === v.trim().toLowerCase()
    );
    return byLabel ? byLabel.id : v;
  };
  if (column.type === "select" || column.type === "status") return toId(value);
  if (column.type === "multiSelect" && Array.isArray(value)) {
    return value.map(toId);
  }
  return value;
}

export function createDataTools(ctx: ToolExecuteContext) {
  return {
    describe_database: tool({
      description:
        "Read an associated database's full schema: columns with types, descriptions, and option vocabularies, plus views and approximate size. Use before querying when the capsule was truncated or you need exact column names. The database must be mentioned in this conversation.",
      inputSchema: z.object({
        databaseId: z
          .string()
          .describe("The database's content id (shown in its mention capsule)"),
      }),
      execute: async ({ databaseId }) => {
        try {
          const gate = await resolveJurisdiction(ctx, databaseId);
          if ("refusal" in gate) return gate.refusal;
          const digest = await buildDataSchemaDigest(databaseId);
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
      inputSchema: z.object({
        databaseId: z.string().describe("The database's content id"),
        filters: z
          .array(
            z.object({
              column: z.string().describe("Column name (case-insensitive) or id"),
              op: z.string().describe("Filter operator (see tool description)"),
              value: z
                .union([
                  z.string(),
                  z.number(),
                  z.boolean(),
                  z.array(z.string()),
                ])
                .optional()
                .describe("Omit for isEmpty/isNotEmpty; option label(s) ok for select-likes"),
            })
          )
          .optional()
          .describe("ANDed conditions"),
        sortBy: z.string().optional().describe("Column name to sort by"),
        sortDirection: z.enum(["asc", "desc"]).optional(),
        columns: z
          .array(z.string())
          .optional()
          .describe("Column names to return; default primary + first 3"),
        limit: z.number().optional().describe("Rows per page, default 20, max 100"),
        cursorSortKey: z.string().optional(),
        cursorId: z
          .string()
          .optional()
          .describe("Continue from a previous result's cursor"),
      }),
      execute: async (input) => {
        try {
          const gate = await resolveJurisdiction(ctx, input.databaseId);
          if ("refusal" in gate) return gate.refusal;
          const { table } = gate;
          const live = table.columns.filter((c) => !c.deletedAt);

          // Compile the model's flat conditions through the ONE filter
          // compiler (plan Phase 2) — no third implementation.
          const conditions: FilterCondition[] = [];
          for (const f of input.filters ?? []) {
            const column = findColumn(live, f.column);
            if (!column) {
              return `No column named "${f.column}" here. Columns: ${live.map((c) => c.name).join(", ")}.`;
            }
            const allowed = operatorsForType(column.type);
            if (!allowed.includes(f.op as FilterOperator)) {
              return `Operator "${f.op}" does not apply to ${column.name} (${column.type}). Allowed: ${allowed.join(", ")}.`;
            }
            conditions.push({
              columnId: column.id,
              operator: f.op as FilterOperator,
              value: translateOptionValue(column, f.value) as CellValue,
            });
          }

          let sorts: DataView["sorts"] = [];
          if (input.sortBy) {
            const column = findColumn(live, input.sortBy);
            if (!column) return `No column named "${input.sortBy}" here.`;
            sorts = [
              {
                columnId: column.id,
                direction: input.sortDirection ?? "asc",
              },
            ];
          }

          // Synthetic view: loadRowPage reads only filters/sorts from it.
          const view = {
            filters: { op: "and", children: conditions },
            sorts,
          } as unknown as DataView;

          const limit = Math.min(
            Math.max(input.limit ?? DEFAULT_LIMIT, 1),
            MAX_LIMIT
          );
          const page = await loadRowPage({
            tableId: input.databaseId,
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
        "Append new rows to an associated database. APPEND-ONLY: cannot modify or delete existing rows. Each row is {columnName: value}; select/status/multiSelect accept option labels; dates are ISO strings; file/contentLink cells take arrays of content ids. Max 25 rows per call; batches over 10 require confirmedByUser: true, which you may set ONLY after the user explicitly approved the batch in conversation. Use dedupeBy with a url column when collecting from the web so re-runs never duplicate rows.",
      inputSchema: z.object({
        databaseId: z.string().describe("The database's content id"),
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
          const gate = await resolveJurisdiction(ctx, input.databaseId);
          if ("refusal" in gate) return gate.refusal;
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
              where: { tableId: input.databaseId, deletedAt: null },
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
          const skipped: string[] = [];
          const errors: string[] = [];
          for (let i = 0; i < input.rows.length; i++) {
            const rowInput = input.rows[i];
            const cells: Record<string, unknown> = {};
            for (const [ref, raw] of Object.entries(rowInput)) {
              const column = findColumn(live, ref);
              if (!column) {
                errors.push(`Row ${i + 1}: no column named "${ref}".`);
                continue;
              }
              cells[column.key] = translateOptionValue(column, raw);
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
          }
          if (errors.length > 0) {
            return `Nothing inserted — fix these first:\n${errors.join("\n")}\nColumns here: ${live.map((c) => c.name).join(", ")}.`;
          }
          if (prepared.length === 0) {
            return `Nothing to insert — all ${input.rows.length} rows were duplicates by ${dedupeColumn?.name}.${skipped.length ? `\nSkipped:\n${skipped.join("\n")}` : ""}`;
          }

          const rowIds = await createRows(
            input.databaseId,
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
          const result = await writeCells(input.databaseId, live, writes);
          const failed = result.results.filter((r) => r.status === "error");

          const parts = [
            `Inserted ${rowIds.length} row${rowIds.length === 1 ? "" : "s"}.`,
          ];
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
  };
}
