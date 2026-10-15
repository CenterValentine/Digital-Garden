import "server-only";

/**
 * Database tools over MCP (MCP-DATABASE-REACH-PLAN §2.2, §2.3, §2.5, §2.8).
 *
 * Reads reuse chat's read discipline — the ONE filter compiler (flat
 * conditions → a synthetic view → `loadRowPage`), the index tier, 8-hex
 * handles — with the per-call token cap as a PAGING control rather than
 * an approval: the client pages, nothing waits for a human. Writes go
 * through the same two functions chat uses (`applyRowInserts`,
 * `applyRowUpdates`), so every cell meets the same encoder. Deletion is
 * consent-gated by the table's own policy: `confirm` asks the user through
 * elicitation when the client can, and refuses when it cannot.
 */

import { z } from "zod";
import { acceptedContent, inputRequired, type InputRequiredResult, type ServerContext } from "@modelcontextprotocol/server";
import { prisma } from "@/lib/database/client";
import { logger } from "@/lib/core/logger";
import { applyRowInserts, applyRowUpdates } from "@/lib/domain/ai/tools/data-tools";
import { findColumn, normalizeCellInput, resolveRowRefs, translateOptionValue } from "@/lib/domain/data/server/resolve";
import { loadRowPage, loadRowsByIds } from "@/lib/domain/data/server/queries";
import { softDeleteRows } from "@/lib/domain/data/server/mutations";
import { loadRowDigests } from "@/lib/domain/data/server/digest-read";
import { readAiPolicy } from "@/lib/domain/data/ai-policy";
import {
  GROUPABLE_TYPES,
  allBulkColumns,
  cellToText,
  deriveRowTitle,
  formatRows,
  groupCountsLine,
  indexTierColumns,
  operatorsForType,
  rowHandle,
  type CellValue,
  type DataColumn,
  type DataRow,
  type DataView,
  type FilterCondition,
  type FilterOperator,
  type RelationMode,
  type RenderOptions,
} from "@/lib/domain/data";
import { publishEvent } from "@/lib/domain/notifications/service";
import { estimateTokens } from "@/lib/domain/ai-context/tokens";
import type { McpPrincipal } from "../auth";
import { openTable, type McpScope } from "../jurisdiction";
import { internalError, ok, refuse, type McpToolResult } from "../results";
import type { queryRowsInput, insertRowsInput, updateRowsInput, deleteRowsInput } from "../schemas";

/** Default per-call cap when the token sets none (plan §2.5: 12k, a paging control). */
export const DEFAULT_READ_TOKEN_CAP = 12_000;
const CLIP_CHARS = 120;
const INDEX_RELATION_RENDER = { maxLinkedTitles: 1, linkedTitleClip: 40 } as const;

type QueryInput = z.infer<typeof queryRowsInput>;
type InsertInput = z.infer<typeof insertRowsInput>;
type UpdateInput = z.infer<typeof updateRowsInput>;
type DeleteInput = z.infer<typeof deleteRowsInput>;

function encodeCursor(row: DataRow): string {
  return Buffer.from(JSON.stringify({ s: row.sortKey, i: row.id })).toString("base64url");
}
function decodeCursor(raw: string | undefined): { sortKey: string; id: string } | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as { s?: unknown; i?: unknown };
    if (typeof v.s === "string" && typeof v.i === "string") return { sortKey: v.s, id: v.i };
  } catch {
    // fall through
  }
  return null;
}

function readCap(principal: McpPrincipal): number {
  return principal.token.readTokenCap ?? DEFAULT_READ_TOKEN_CAP;
}

export async function queryRows(scope: McpScope, principal: McpPrincipal, input: QueryInput): Promise<McpToolResult> {
  try {
    const opened = await openTable(scope, input.database, "read");
    if ("refusal" in opened) return refuse(opened.refusal);
    const { databaseId, table } = opened;
    const live = table.columns.filter((c) => !c.deletedAt);
    const columnNames = () => live.map((c) => c.name).join(", ");

    // Flat conditions → the one filter compiler, exactly as chat does.
    const conditions: FilterCondition[] = [];
    for (const f of input.filters ?? []) {
      const column = findColumn(live, f.column);
      if (!column) return refuse(`No column named "${f.column}" here. Columns: ${columnNames()}.`);
      const allowed = operatorsForType(column.type);
      if (!allowed.includes(f.op as FilterOperator)) {
        return refuse(`Operator "${f.op}" does not apply to ${column.name} (${column.type}). Allowed: ${allowed.join(", ")}.`);
      }
      conditions.push({
        columnId: column.id,
        operator: f.op as FilterOperator,
        value: translateOptionValue(column, f.value) as CellValue,
      });
    }

    // A saved view contributes its filters and sorts (plan §2.2 / §3).
    let viewFilters: unknown = null;
    let sorts: DataView["sorts"] = [];
    if (input.view) {
      const needle = input.view.trim().toLowerCase();
      const view = table.views.find((v) => v.id === input.view || v.name.trim().toLowerCase() === needle);
      if (!view) return refuse(`No view named "${input.view}". Views: ${table.views.map((v) => v.name).join(", ") || "(none)"}.`);
      viewFilters = view.filters;
      sorts = view.sorts;
    }
    if (input.sortBy) {
      const column = findColumn(live, input.sortBy);
      if (!column) return refuse(`No column named "${input.sortBy}" here. Columns: ${columnNames()}.`);
      sorts = [{ columnId: column.id, direction: input.sortDirection === "desc" ? "desc" : "asc" }];
    }

    // Column selection: index tier by default; named in full; "all" clipped.
    let selection: "index" | "all" | "named" = "index";
    let shown: DataColumn[];
    const fullColumns = new Set<string>();
    if (input.columns === "all") {
      selection = "all";
      shown = allBulkColumns(live);
    } else if (Array.isArray(input.columns) && input.columns.length > 0) {
      selection = "named";
      shown = [];
      const unknown: string[] = [];
      for (const ref of input.columns) {
        const c = findColumn(live, ref);
        if (!c) unknown.push(ref);
        else if (!shown.includes(c)) {
          shown.push(c);
          fullColumns.add(c.id);
        }
      }
      if (unknown.length > 0) return refuse(`No column named ${unknown.map((u) => `"${u}"`).join(", ")} here. Columns: ${columnNames()}.`);
    } else {
      shown = indexTierColumns(live);
    }
    const render: RenderOptions = {
      relations: (input.relations ?? "titles") as RelationMode,
      clipChars: CLIP_CHARS,
      fullColumns,
      ...(selection === "index" ? INDEX_RELATION_RENDER : {}),
    };

    // Explicit rows: a fetch call. Full columns unless the caller narrowed.
    let rowIds: string[] | undefined;
    if (input.rows && input.rows.length > 0) {
      const resolved = await resolveRowRefs(databaseId, input.rows);
      const refusals = resolved.filter((r): r is { refusal: string } => "refusal" in r);
      if (refusals.length > 0) return refuse(`Nothing read — fix these row references first:\n${refusals.map((r) => r.refusal).join("\n")}`);
      rowIds = resolved.map((r) => (r as { id: string }).id);
      if (selection === "all") for (const c of shown) fullColumns.add(c.id);
    }

    const view = {
      filters: viewFilters
        ? { op: "and", children: [viewFilters, ...conditions] }
        : { op: "and", children: conditions },
      sorts,
    } as unknown as DataView;
    const limit = Math.min(Math.max(input.limit ?? 100, 1), 1000);

    if (input.groupBy) {
      const column = findColumn(live, input.groupBy);
      if (!column) return refuse(`No column named "${input.groupBy}" here. Columns: ${columnNames()}.`);
      if (!GROUPABLE_TYPES.has(column.type)) {
        return refuse(`groupBy needs a select, status, checkbox, multiSelect, relation, or person column — ${column.name} is ${column.type}.`);
      }
      const all = await loadRowPage({ tableId: databaseId, view, columns: live, cursor: null, limit: 1000, viewerId: scope.userId, search: input.search, rowIds });
      const line = groupCountsLine(all.rows, column);
      return ok(`${table.title} — ${column.name} counts over ${all.rows.length} of ${all.total} rows\n${line}`, {
        database: databaseId,
        groupBy: column.name,
        counted: all.rows.length,
        total: all.total,
      });
    }

    const page = rowIds
      ? { rows: await loadRowsByIds(databaseId, rowIds, live, scope.userId), nextCursor: null, total: rowIds.length }
      : await loadRowPage({ tableId: databaseId, view, columns: live, cursor: decodeCursor(input.cursor), limit, viewerId: scope.userId, search: input.search });

    let rows = rowIds ? rowIds.map((id) => page.rows.find((r) => r.id === id)).filter((r): r is DataRow => !!r) : page.rows;

    // Digests ride as a per-row suffix when the table keeps them.
    let suffixByRow: Map<string, string> | undefined;
    if (input.digests && table.rowDigests && rows.length > 0) {
      const digests = await loadRowDigests(rows, live);
      suffixByRow = new Map();
      for (const [rowId, d] of digests) suffixByRow.set(rowId, ` · ${d.text}${d.fresh ? "" : " (digest stale)"}`);
    }

    // The cap is a paging control: shrink the page until it fits, then hand
    // back a cursor at the last row kept.
    const cap = readCap(principal);
    let body = formatRows({ rows, columns: shown, live, render, suffixByRow });
    let truncatedByBudget = false;
    while (body.tokens > cap && rows.length > 1) {
      rows = rows.slice(0, Math.max(1, Math.floor(rows.length / 2)));
      body = formatRows({ rows, columns: shown, live, render, suffixByRow });
      truncatedByBudget = true;
    }
    const nextCursor = truncatedByBudget && rows.length > 0 && !rowIds
      ? encodeCursor(rows[rows.length - 1])
      : page.nextCursor
        ? encodeCursor({ ...rows[rows.length - 1], sortKey: (page.nextCursor as { sortKey: string }).sortKey, id: (page.nextCursor as { id: string }).id } as DataRow)
        : null;

    const header = `${table.title}: ${rows.length} of ${page.total} row${page.total === 1 ? "" : "s"} · ${shown.length} column${shown.length === 1 ? "" : "s"} · ~${estimateTokens(body.text)} tokens${nextCursor ? " · more: pass nextCursor" : " · complete"}`;
    const structuredRows = rows.map((r) => {
      const entry: Record<string, unknown> = { handle: rowHandle(r.id), id: r.id, title: deriveRowTitle(live, r.data) || "Untitled" };
      if (selection !== "index") {
        const cells: Record<string, string> = {};
        for (const c of shown) cells[c.name] = cellToText(c, (r.data as Record<string, CellValue | undefined>)[c.key]);
        entry.cells = cells;
      }
      return entry;
    });
    return ok(`${header}\n${body.text}`, {
      database: databaseId,
      title: table.title,
      returned: rows.length,
      total: page.total,
      nextCursor,
      truncatedByBudget,
      columns: shown.map((c) => c.name),
      rows: structuredRows,
    });
  } catch (error) {
    logger.warn({ layer: "ai", event: "mcp:query_rows_caught", summary: "garden_query_rows failed", error });
    return internalError("garden_query_rows", error, Object.keys(input));
  }
}

export async function insertRows(scope: McpScope, input: InsertInput): Promise<McpToolResult> {
  try {
    const opened = await openTable(scope, input.database, "write");
    if ("refusal" in opened) return refuse(opened.refusal);
    const receipt = await applyRowInserts({ userId: scope.userId }, opened.databaseId, opened.table, input.rows, input.dedupeBy);
    const inserted = Number(/^Inserted (\d+)/.exec(receipt)?.[1] ?? 0);
    const failed = /^Nothing (inserted|to insert)/.test(receipt);
    return failed ? refuse(receipt, { inserted: 0 }) : ok(receipt, { database: opened.databaseId, inserted });
  } catch (error) {
    logger.warn({ layer: "ai", event: "mcp:insert_rows_caught", summary: "garden_insert_rows failed", error });
    return internalError("garden_insert_rows", error, Object.keys(input));
  }
}

export async function updateRows(scope: McpScope, input: UpdateInput): Promise<McpToolResult> {
  try {
    const opened = await openTable(scope, input.database, "write");
    if ("refusal" in opened) return refuse(opened.refusal);
    const receipt = await applyRowUpdates(
      { userId: scope.userId },
      opened.databaseId,
      opened.table,
      input.updates.map((u) => ({ rowId: u.row, cells: u.cells, expect: u.expect, merge: u.merge }))
    );
    const failed = /^(Not updated|Nothing updated)/.test(receipt);
    return failed ? refuse(receipt, { updated: 0 }) : ok(receipt, { database: opened.databaseId, updated: input.updates.length });
  } catch (error) {
    logger.warn({ layer: "ai", event: "mcp:update_rows_caught", summary: "garden_update_rows failed", error });
    return internalError("garden_update_rows", error, Object.keys(input));
  }
}

const confirmSchema = z.object({ confirm: z.boolean() });

export async function deleteRows(
  scope: McpScope,
  principal: McpPrincipal,
  input: DeleteInput,
  ctx: ServerContext
): Promise<McpToolResult | InputRequiredResult> {
  try {
    const opened = await openTable(scope, input.database, "write");
    if ("refusal" in opened) return refuse(opened.refusal);
    const { databaseId, table } = opened;
    const policy = readAiPolicy(table.aiPolicy).delete;
    if (policy === "deny") {
      return refuse(`Deleting rows in "${table.title}" is turned off for assistants (schema rail → "AI deletes rows": Never). The user can delete in the grid or change that setting.`);
    }
    const resolved = await resolveRowRefs(databaseId, input.rows);
    const refusals = resolved.filter((r): r is { refusal: string } => "refusal" in r);
    if (refusals.length > 0) return refuse(`Nothing deleted — ${refusals.length} reference(s) did not resolve:\n${refusals.map((r) => r.refusal).join("\n")}`);
    const ids = resolved.map((r) => (r as { id: string }).id);
    const handles = ids.map((id) => `[${rowHandle(id)}]`).join(" ");

    if (policy === "confirm") {
      const message = `Delete ${ids.length} row${ids.length === 1 ? "" : "s"} from "${table.title}"? ${handles}\nReason given: ${input.reason}\n(They go to the trash and can be restored from the grid's Undo.)`;
      const era = (ctx.mcpReq as { era?: string }).era;
      if (era === "legacy") {
        // 2025-era client: ask through the live elicitation request; a client
        // without the capability throws, and that is a refusal here.
        try {
          const answer = await ctx.mcpReq.elicitInput({
            mode: "form",
            message,
            requestedSchema: {
              type: "object",
              properties: { confirm: { type: "boolean", title: "Delete these rows" } },
              required: ["confirm"],
            },
          });
          const confirmed = answer.action === "accept" && (answer.content as { confirm?: unknown } | undefined)?.confirm === true;
          if (!confirmed) return refuse("The user did not confirm the deletion. Nothing changed.", { confirmed: false });
        } catch {
          return refuse(`This client cannot ask the user to confirm, and "${table.title}" requires confirmation for assistant deletes. Ask the user to delete in the app, or to set the database's policy to Allowed on its schema rail.`);
        }
      } else {
        const accepted = acceptedContent(ctx.mcpReq.inputResponses, "confirm", confirmSchema);
        if (accepted?.confirm !== true) {
          if (ctx.mcpReq.inputResponses && "confirm" in ctx.mcpReq.inputResponses) {
            return refuse("The user did not confirm the deletion. Nothing changed.", { confirmed: false });
          }
          return inputRequired({
            inputRequests: { confirm: inputRequired.elicit({ message, requestedSchema: confirmSchema }) },
          });
        }
      }
    }

    const deleted = await softDeleteRows(databaseId, ids, scope.userId);
    if (policy === "allow") {
      try {
        await publishEvent(prisma, {
          kind: "ai.notify",
          actorType: "ai",
          actorLabel: `MCP token "${principal.token.name}"`,
          payload: {
            title: `MCP deleted ${deleted} row${deleted === 1 ? "" : "s"} from ${table.title}`,
            body: `${input.reason}\nRows: ${handles}\nIf this was wrong, open the table and use Undo to restore them.`,
          },
          subjectType: "content",
          subjectId: databaseId,
          recipients: [{ userId: scope.userId }],
        });
      } catch (error) {
        logger.warn({ layer: "ai", event: "mcp:delete_notice_failed", summary: "inbox notice not posted", error });
      }
    }
    return ok(`Deleted ${deleted} of ${ids.length} row${ids.length === 1 ? "" : "s"} from "${table.title}": ${handles}. Policy: ${policy}. The user can restore them from the grid's Undo.`, {
      database: databaseId,
      deleted,
      policy,
      rows: ids.map((id) => rowHandle(id)),
    });
  } catch (error) {
    logger.warn({ layer: "ai", event: "mcp:delete_rows_caught", summary: "garden_delete_rows failed", error });
    return internalError("garden_delete_rows", error, Object.keys(input));
  }
}

/** Shared by garden_read for databases: cell text for the structured schema. */
export function normalizeForWrite(column: DataColumn, raw: unknown): unknown {
  return normalizeCellInput(column, raw);
}
