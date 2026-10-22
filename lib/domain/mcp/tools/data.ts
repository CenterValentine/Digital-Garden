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
 * elicitation when the client can; when it cannot, the assistant may still
 * remove the rows it inserted itself (`lib/domain/data/authorship.ts`) and
 * the user's rows are held with the reason.
 */

import { z } from "zod";
import { acceptedContent, inputRequired, type InputRequiredResult, type ServerContext } from "@modelcontextprotocol/server";
import { prisma } from "@/lib/database/client";
import { logger } from "@/lib/core/logger";
import { applyRowInserts, applyRowUpdates } from "@/lib/domain/ai/tools/data-tools";
import { findColumn, normalizeCellInput, resolveRowRefs, translateOptionValue } from "@/lib/domain/data/server/resolve";
import { loadRowPage, loadRowsByIds } from "@/lib/domain/data/server/queries";
import { softDeleteRows } from "@/lib/domain/data/server/mutations";
import { splitRowsByAuthorship } from "@/lib/domain/data/server/authorship";
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
  type RowPageCursor,
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

/**
 * Opaque continuation: keyset (`s`, `i`) in the natural order, or an offset
 * (`o`) under view sorts — both shapes of RowPageCursor, which is what the
 * server hands back. The model never sees the inside.
 */
function encodeCursor(cursor: RowPageCursor): string {
  const v = typeof cursor.offset === "number" ? { o: cursor.offset } : { s: cursor.sortKey, i: cursor.id };
  return Buffer.from(JSON.stringify(v)).toString("base64url");
}
function decodeCursor(raw: string | undefined): RowPageCursor | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as { s?: unknown; i?: unknown; o?: unknown };
    if (typeof v.s === "string" && typeof v.i === "string") return { sortKey: v.s, id: v.i };
    if (typeof v.o === "number" && v.o > 0) return { offset: v.o };
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

    const inboundCursor = decodeCursor(input.cursor);
    const page = rowIds
      ? { rows: await loadRowsByIds(databaseId, rowIds, live, scope.userId), nextCursor: null, total: rowIds.length }
      : await loadRowPage({ tableId: databaseId, view, columns: live, cursor: inboundCursor, limit, viewerId: scope.userId, search: input.search });

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
    // A budget cut continues from the last row KEPT: keyset from its key in
    // the natural order; under sorts, the offset of the row after it.
    const offsetBase = typeof inboundCursor?.offset === "number" ? inboundCursor.offset : 0;
    const nextCursor = truncatedByBudget && rows.length > 0 && !rowIds
      ? encodeCursor(
          sorts.length > 0
            ? { offset: offsetBase + rows.length }
            : { sortKey: rows[rows.length - 1].sortKey, id: rows[rows.length - 1].id }
        )
      : page.nextCursor
        ? encodeCursor(page.nextCursor)
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

export async function insertRows(scope: McpScope, principal: McpPrincipal, input: InsertInput): Promise<McpToolResult> {
  try {
    const opened = await openTable(scope, input.database, "write");
    if ("refusal" in opened) return refuse(opened.refusal);
    // Stamped as the MCP's own rows (any of the user's tokens may later
    // delete them without a confirmation — authorship.ts).
    const receipt = await applyRowInserts({ userId: scope.userId }, opened.databaseId, opened.table, input.rows, input.dedupeBy, {
      kind: "mcp",
      ref: principal.token.id,
    });
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

/**
 * Whether THIS client can be asked to confirm, decided by the caller
 * (server.ts) from what the client declared, not discovered by trying:
 *
 *   - 2026-07-28 era: the request envelope carries the client's
 *     capabilities; `inputRequired(...)` reaches a client that declared
 *     `elicitation`, and is a protocol error toward one that did not.
 *   - 2025 era: capabilities are declared at `initialize`. The garden's
 *     route serves 2025-era clients STATELESSLY (mcp-handler `legacy:
 *     "stateless"`), so the per-request server never saw an initialize and
 *     the SDK's legacy shim refuses every input request on this route
 *     ("no client capabilities are available on this connection"). That is
 *     the wall the ChatGPT connector hit (2026-10-21), and every other
 *     2025-era client hits the same one. There is no `era` field on the
 *     request context — the old legacy branch here tested one and was dead.
 */
export interface DeleteAsk {
  canElicit: boolean;
}

export async function deleteRows(
  scope: McpScope,
  principal: McpPrincipal,
  input: DeleteInput,
  ctx: ServerContext,
  ask: DeleteAsk
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
    const handleList = (list: string[]) => list.map((id) => `[${rowHandle(id)}]`).join(" ");
    const handles = handleList(ids);

    // Which rows this call may remove, and which it must hold. Under
    // "confirm": the assistant's own rows (authorship.ts) go without asking;
    // the user's rows go only on the user's word.
    let toDelete = ids;
    let held: string[] = [];
    let ownRowsOnly = false;
    let userConfirmed = false;

    if (policy === "confirm") {
      const split = await splitRowsByAuthorship(databaseId, ids);
      if (split.userWritten.length === 0) {
        ownRowsOnly = true;
      } else {
        const accepted = acceptedContent(ctx.mcpReq.inputResponses, "confirm", confirmSchema);
        if (accepted?.confirm === true) {
          userConfirmed = true;
        } else if (ctx.mcpReq.inputResponses && "confirm" in ctx.mcpReq.inputResponses) {
          return refuse("The user did not confirm the deletion. Nothing changed.", { confirmed: false });
        } else if (ask.canElicit) {
          const message = `Delete ${ids.length} row${ids.length === 1 ? "" : "s"} from "${table.title}"? ${handles}\nReason given: ${input.reason}\n(They go to the trash and can be restored from the grid's Undo.)`;
          return inputRequired({
            inputRequests: { confirm: inputRequired.elicit({ message, requestedSchema: confirmSchema }) },
          });
        } else {
          // No way to ask on this connection: do what needs no asking, hold
          // the rest, and say exactly which is which.
          toDelete = split.aiDrafted;
          held = split.userWritten;
          if (toDelete.length === 0) {
            return refuse(
              `Nothing deleted. "${table.title}" asks the user before an assistant deletes rows, this client cannot show that confirmation, and none of these rows were inserted by an assistant: ${handles}. Ask the user to delete them in the app, or to set "AI deletes rows" to Allowed on the database's schema rail.`,
              { deleted: 0, held: held.map((id) => rowHandle(id)), policy }
            );
          }
        }
      }
    }

    const deleted = await softDeleteRows(databaseId, toDelete, scope.userId);
    const deletedHandles = handleList(toDelete);

    // A notice whenever the user did not just say yes on a confirmation.
    if (!userConfirmed) {
      try {
        await publishEvent(prisma, {
          kind: "ai.notify",
          actorType: "ai",
          actorLabel: `MCP token "${principal.token.name}"`,
          payload: {
            title: ownRowsOnly || held.length > 0
              ? `MCP deleted ${deleted} row${deleted === 1 ? "" : "s"} it had added to ${table.title}`
              : `MCP deleted ${deleted} row${deleted === 1 ? "" : "s"} from ${table.title}`,
            body: `${input.reason}\nRows: ${deletedHandles}\nIf this was wrong, open the table and use Undo to restore them.${held.length > 0 ? `\nHeld (yours, not deleted — this client could not ask you): ${handleList(held)}` : ""}`,
          },
          subjectType: "content",
          subjectId: databaseId,
          recipients: [{ userId: scope.userId }],
        });
      } catch (error) {
        logger.warn({ layer: "ai", event: "mcp:delete_notice_failed", summary: "inbox notice not posted", error });
      }
    }

    const consent =
      policy === "allow"
        ? "Policy: allow (the user was notified)."
        : userConfirmed
          ? "Policy: confirm (the user confirmed)."
          : "Policy: confirm — these were rows an assistant had inserted, so no confirmation was needed (the user was notified).";
    const heldLine = held.length > 0
      ? ` Held ${held.length} user-written row${held.length === 1 ? "" : "s"}: ${handleList(held)} — this client cannot ask the user to confirm, so tell the user: they can delete those in the app, or set "AI deletes rows" to Allowed on the database's schema rail.`
      : "";
    return ok(`Deleted ${deleted} of ${toDelete.length} row${toDelete.length === 1 ? "" : "s"} from "${table.title}": ${deletedHandles}. ${consent} The user can restore them from the grid's Undo.${heldLine}`, {
      database: databaseId,
      deleted,
      policy,
      rows: toDelete.map((id) => rowHandle(id)),
      held: held.map((id) => rowHandle(id)),
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
