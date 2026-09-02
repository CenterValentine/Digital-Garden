/**
 * Shared resolution + normalization for AI-facing database access.
 *
 * Extracted VERBATIM from lib/domain/ai/tools/data-tools.ts (P0 of
 * EXTRACTION-TO-DATABASE-PLAN, 2026-09-02) so two callers share one
 * implementation: the standalone data tools (describe/query/insert/update/
 * propose_column_options) and the iteration capture path (P1/P2 — the
 * proposal preflight and record_item_result's row write).
 *
 * Behavior contract: refusal strings and semantics here are load-bearing —
 * models learn from them, and the data tools' callers pattern-match
 * `"refusal" in result`. Do not reword casually.
 *
 * Deliberately NOT importing the AI tool layer: callers pass the minimal
 * `DataToolContext` ids (ToolExecuteContext satisfies it structurally).
 */

import { prisma } from "@/lib/database/client";
import {
  canRead,
  resolveDataTableAccess,
} from "@/lib/domain/data/server/access";
import { loadTable } from "@/lib/domain/data/server/queries";
import type { DataColumn, DataTable } from "@/lib/domain/data";

/** The context ids database resolution needs — a structural subset of ToolExecuteContext. */
export interface DataToolContext {
  userId: string;
  /** Editor-scoped content id (undefined for database-bound chats). */
  contentId?: string;
  /** The chat's raw bound content node, whatever its type. */
  boundContentId?: string;
  /** The bound Conversation entity id, when the chat is saved. */
  conversationId?: string;
}

/**
 * The database this chat is implicitly bound to, if any: the bound
 * content is the data node itself, OR a promoted row's page — a chat
 * open on a row page is open on the row (owner report, 2026-08-28).
 */
export async function boundTableIdFor(
  ctx: DataToolContext
): Promise<string | null> {
  // boundContentId is the raw chat binding; contentId is editor-scoped
  // (undefined for database-bound chats — the hole that made every
  // "bound here" check silently false, owner report 2026-08-28).
  const bound = ctx.boundContentId ?? ctx.contentId;
  if (!bound) return null;
  const data = await prisma.contentNode.findFirst({
    where: {
      id: bound,
      ownerId: ctx.userId,
      contentType: "data",
      deletedAt: null,
    },
    select: { id: true },
  });
  if (data) return data.id;
  const row = await prisma.dataRow.findFirst({
    where: { contentId: bound, deletedAt: null },
    select: { tableId: true },
  });
  return row?.tableId ?? null;
}

/**
 * Structural jurisdiction: the database must be associated with THIS
 * conversation, and the user must be able to read it. Returns the loaded
 * table or a model-facing refusal string.
 */
export async function resolveJurisdiction(
  ctx: DataToolContext,
  databaseId: string
): Promise<
  | { table: DataTable; level: Awaited<ReturnType<typeof resolveDataTableAccess>> }
  | { refusal: string }
> {
  // The chat being OPEN ON this database — the node itself, or one of
  // its row pages — is the strongest association there is; sidechat
  // binding (plan Phase 6) needs no ConversationAssociation row.
  const boundHere =
    ctx.boundContentId === databaseId ||
    ctx.contentId === databaseId ||
    (await boundTableIdFor(ctx)) === databaseId;
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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Model ergonomics for the database reference (owner failure report,
 * 2026-08-28): weak models pass the database's NAME, or omit the id in a
 * sidechat that is literally open on the table. Accept all three — a
 * UUID, nothing (→ the bound data node), or a title (case-insensitive,
 * unique among the user's databases).
 */
export async function resolveDatabaseRef(
  ctx: DataToolContext,
  ref: string | undefined
): Promise<{ id: string } | { refusal: string }> {
  const trimmed = ref?.trim();
  if (trimmed && UUID_RE.test(trimmed)) return { id: trimmed };
  if (!trimmed) {
    const bound = await boundTableIdFor(ctx);
    if (bound) return { id: bound };
    return {
      refusal:
        "No database given and this chat isn't open on one — pass databaseId (the id from the mention capsule) or the database's exact name.",
    };
  }
  const matches = await prisma.contentNode.findMany({
    where: {
      ownerId: ctx.userId,
      contentType: "data",
      deletedAt: null,
      title: { equals: trimmed, mode: "insensitive" },
    },
    select: { id: true, title: true },
    take: 2,
  });
  if (matches.length === 1) return { id: matches[0].id };
  if (matches.length > 1) {
    return {
      refusal: `More than one database is named "${trimmed}" — use the id from the mention capsule instead.`,
    };
  }
  return {
    refusal: `No database named "${trimmed}". Use the id (or exact name) from the mention capsule, or ask the user which database they mean.`,
  };
}

/** Column lookup by name (case-insensitive), key, or id. */
export function findColumn(
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
export function translateOptionValue(
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

/**
 * Normalization safety (owner-requested, 2026-08-28): the strict encoder
 * REJECTS type violations by design (plan B8c — never coerce), but a model
 * legitimately produces unambiguous near-misses. Normalize exactly those,
 * nothing else, BEFORE the encoder:
 *  - strings trimmed;
 *  - number columns: a purely numeric string becomes a number;
 *  - checkbox columns: "true"/"yes"/"false"/"no" strings become booleans;
 *  - date columns: M/D/YYYY becomes ISO YYYY-MM-DD (ISO passes through).
 * Anything still ambiguous falls to the encoder and fails loudly — a
 * normalization that guesses is worse than a rejection that teaches.
 */
export function normalizeCellInput(column: DataColumn, raw: unknown): unknown {
  let value = raw;
  if (typeof value === "string") value = value.trim();
  if (column.type === "number" && typeof value === "string" && value !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) value = n;
  }
  if (column.type === "checkbox" && typeof value === "string") {
    const v = value.toLowerCase();
    if (v === "true" || v === "yes") value = true;
    else if (v === "false" || v === "no") value = false;
  }
  if (column.type === "date" && typeof value === "string") {
    const us = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (us) {
      value = `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
    }
  }
  return translateOptionValue(column, value);
}

/** Cells no write tool may target, with the reason the model needs. */
export function writeBlockReason(column: DataColumn): string | null {
  if (column.type === "relation") {
    return `${column.name} is a relation — links change through the table UI, not cell writes (not supported by this tool yet).`;
  }
  if (column.type === "lookup" || column.type === "rollup") {
    return `${column.name} is computed from a relation — it has no stored value to write.`;
  }
  return null;
}
