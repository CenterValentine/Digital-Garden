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
        "Append new rows to an associated database. APPEND-ONLY: cannot modify or delete existing rows. Each row is {columnName: value}; select/status/multiSelect accept option labels; dates are ISO strings; file/contentLink cells take arrays of content ids. Max 25 rows per call; batches over 10 require confirmedByUser: true, which you may set ONLY after the user explicitly approved the batch in conversation. Use dedupeBy with a url column when collecting from the web so re-runs never duplicate rows.",
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

    update_row: tool({
      description:
        "Update cells in ONE existing row. Only the columns you pass change — when the user under-specifies, OMIT everything they didn't mention, never guess a value. Pass null to CLEAR a cell, and only when the user asked for it to be blank. Get the rowId from query_database (each result line starts with [rowId]); pass expect with the current values from that same read — a stale expect fails safe instead of overwriting someone's edit, and the result tells you to re-query. All-or-nothing: if any cell is stale or invalid, no cell changes. Cannot touch relations (links) or computed columns, and cannot create or delete rows. File cells accept ONLY ids of file nodes (uploaded attachments, or files you created with a file tool) — other content belongs in a contentLink cell; to attach something from the user's disk, ask them to upload via the cell's + first.",
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
          for (const [ref, raw] of entries) {
            const column = findColumn(live, ref);
            if (!column) {
              errors.push(`No column named "${ref}".`);
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
          return `Updated ${writes.length} cell${writes.length === 1 ? "" : "s"} on the row. The user sees the change in the grid and can undo it there.`;
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
    // ─── propose_output_database ────────────────────────────
    // P5 (EXTRACTION-TO-DATABASE-PLAN §3.7, D1 reversed): the AI structures
    // the output database — schema derived from the charter's objective,
    // with an AI-written description on EVERY column (the load-bearing
    // capture context of §3.1) and initial vocabularies inline. Proposal,
    // not a write: the sentinel renders as OutputDatabaseProposalCard and
    // the USER's Apply click creates the table (POST /api/content/data).
    propose_output_database: tool({
      description:
        "Propose a NEW database for capturing results when no suitable table exists (or the user asks for one). Renders a review card — NOTHING is created until the user clicks Apply, so never claim the database exists. Derive the schema from the run's objective and write a real description on EVERY column (what goes in it, where values come from) — descriptions are the capture mapping context. Type rule: select/status ONLY for vocabularies the user controls (pipeline stages, your own categories) and ALWAYS with initial options; text for anything the web invents (titles, companies, locations). Include a url column when items have pages — it becomes the dedupe identity. Prefer binding to an EXISTING table when one fits; propose creation only when none does. After the user applies, bind the new table via captureTo in propose_item_iteration.",
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
            z.object({
              name: z.string().min(1).max(120),
              type: z
                .enum([
                  "text",
                  "longText",
                  "number",
                  "url",
                  "date",
                  "checkbox",
                  "select",
                  "multiSelect",
                  "status",
                  "file",
                  "email",
                  "phone",
                ])
                .describe("Column type — see the type rule in the tool description."),
              description: z
                .string()
                .min(8)
                .max(500)
                .describe(
                  "REQUIRED on every column: what goes in it and where values come from — this is the model-facing capture context, not decoration.",
                ),
              options: z
                .array(
                  z.object({
                    label: z.string().min(1).max(120),
                    color: z.string().optional(),
                    group: z.enum(["todo", "active", "done"]).optional(),
                  }),
                )
                .max(50)
                .optional()
                .describe("select/multiSelect/status: the initial vocabulary (REQUIRED for those types — an option-less select rejects every value)."),
              primary: z
                .boolean()
                .optional()
                .describe("Mark exactly ONE column as the primary (the row's title — usually the item's name/title column)."),
            }),
          )
          .min(1)
          .max(20)
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
            const selectLike =
              raw.type === "select" ||
              raw.type === "multiSelect" ||
              raw.type === "status";
            if (selectLike && (!raw.options || raw.options.length === 0)) {
              return `"${name}" is a ${raw.type} column with NO initial options — an option-less ${raw.type} rejects every captured value (owner smoke, 2026-09-02). Provide the initial vocabulary, or make it a text column if the web controls the values.`;
            }
            if (!selectLike && raw.options && raw.options.length > 0) {
              return `"${name}" is a ${raw.type} column — options belong only to select/multiSelect/status.`;
            }
            columns.push({
              name: name.slice(0, 120),
              type: raw.type,
              description: raw.description.trim(),
              ...(raw.options
                ? {
                    options: raw.options
                      .map((o) => ({
                        label: o.label.trim().slice(0, 120),
                        ...(o.color && /^[a-z][a-z0-9-]{0,23}$/.test(o.color)
                          ? { color: o.color }
                          : {}),
                        ...(raw.type === "status"
                          ? { group: o.group ?? ("todo" as const) }
                          : {}),
                      }))
                      .filter((o) => o.label.length > 0),
                  }
                : {}),
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
          // Placement (owner policy: no root scatter — a table minted at
          // root among hundreds of files is invisible): home the new table
          // beside the active charter, else in the chat's target folder.
          let parentId: string | null = null;
          let parentTitle: string | null = null;
          if (ctx.activeCharter) {
            const charterNode = await prisma.contentNode.findFirst({
              where: {
                id: ctx.activeCharter.contentId,
                ownerId: ctx.userId,
                deletedAt: null,
              },
              select: { parentId: true },
            });
            parentId = charterNode?.parentId ?? null;
          }
          if (!parentId && ctx.targetFolderId) {
            parentId = ctx.targetFolderId;
          }
          if (parentId) {
            const parent = await prisma.contentNode.findFirst({
              where: { id: parentId, ownerId: ctx.userId, deletedAt: null },
              select: { id: true, title: true },
            });
            parentId = parent?.id ?? null;
            parentTitle = parent?.title ?? null;
          }
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
  };
}
