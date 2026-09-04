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
import type { DataTable } from "@/lib/domain/data";

/** The context ids database resolution needs — a structural subset of ToolExecuteContext. */
export interface DataToolContext {
  userId: string;
  /** Editor-scoped content id (undefined for database-bound chats). */
  contentId?: string;
  /** The chat's raw bound content node, whatever its type. */
  boundContentId?: string;
  /** The bound Conversation entity id, when the chat is saved. */
  conversationId?: string;
  /**
   * The chat's attached charter, when any (structurally supplied by the
   * full ToolExecuteContext). Grants charter-registry jurisdiction: tables
   * linked from the charter's master ledger are reachable without a fresh
   * mention — the consent chain is user → charter attach → registry.
   */
  activeCharter?: { contentId: string; title: string };
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
 * Charter-registry jurisdiction (EXTRACTION-TO-DATABASE-PLAN P3 resume):
 * with a charter attached, the charter's master ledger IS a consent
 * surface — the master itself and every table its rows link (quest
 * ledgers, output tables) are within jurisdiction, no fresh mention
 * needed. Owner smoke 2026-09-04: "Continue the Reading Quest" in a new
 * chat was refused access to the quest's own output table, defeating the
 * registry's whole purpose ("every consumer navigates through the
 * links"). Scope note: everything reachable this way is the SAME user's
 * own data behind the usual access checks — jurisdiction here is a
 * consent-visibility structure, not a cross-principal boundary.
 */
async function charterRegistryAuthorizes(
  ctx: DataToolContext,
  databaseId: string,
): Promise<boolean> {
  const charter = ctx.activeCharter;
  if (!charter) return false;
  const note = await prisma.contentNode.findFirst({
    where: { id: charter.contentId, ownerId: ctx.userId, deletedAt: null },
    select: { notePayload: { select: { metadata: true } } },
  });
  const meta =
    note?.notePayload?.metadata && typeof note.notePayload.metadata === "object"
      ? (note.notePayload.metadata as Record<string, unknown>)
      : undefined;
  const masterId = meta?.masterLedgerId;
  if (typeof masterId !== "string") return false;
  if (databaseId === masterId) return true;
  // One row per quest — the scan is bounded by the charter's quest count.
  const rows = await prisma.dataRow.findMany({
    where: { tableId: masterId, deletedAt: null },
    select: { data: true },
  });
  for (const r of rows) {
    for (const v of Object.values((r.data ?? {}) as Record<string, unknown>)) {
      if (Array.isArray(v) && v.some((x) => x === databaseId)) return true;
    }
  }
  return false;
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
    if (!assoc && !(await charterRegistryAuthorizes(ctx, databaseId))) {
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

// The pure column helpers (findColumn / translateOptionValue /
// normalizeCellInput / writeBlockReason) moved VERBATIM to
// lib/domain/data/capture-core.ts in the P1/P2 build so the capture
// validation is unit-testable without Prisma. Re-exported here so this
// module's import surface is unchanged for existing consumers.
export {
  findColumn,
  normalizeCellInput,
  translateOptionValue,
  writeBlockReason,
} from "../capture-core";
