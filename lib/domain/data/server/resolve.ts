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
import { matchRowRef, parseRowRef } from "@/lib/domain/data/read-format";
import type { DataTable } from "@/lib/domain/data";
import { Prisma } from "@/lib/database/generated/prisma";
import {
  parseCharter,
  resolveCharterReferencedTables,
} from "@/lib/domain/ai/charters/parse";
import type { JSONContent } from "@tiptap/core";

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
export async function charterRegistryAuthorizes(
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
 * The databases the attached charter names in its body — its Inputs list,
 * its process steps. Prod 23fd28d6 (2026-09-27): the *Apply for a job*
 * charter says "Look at everything in the [[Career Evidence Library]]",
 * the model asked for exactly that, and jurisdiction refused it — the link
 * the user wrote into the rubric was printed in context and denied by the
 * tools, the same contradiction the relation walk below closes for
 * relation columns. The charter is the user's pointing; naming a database
 * in it is consent to read it in the charter's runs. Same scope note as
 * `charterRegistryAuthorizes`: the user's own data, behind the usual
 * access checks. One note load + one title lookup, refusal path only.
 */
export async function charterReferencedTableIds(
  ctx: DataToolContext,
): Promise<string[]> {
  const charter = ctx.activeCharter;
  if (!charter) return [];
  const note = await prisma.contentNode.findFirst({
    where: { id: charter.contentId, ownerId: ctx.userId, deletedAt: null },
    select: { notePayload: { select: { tiptapJson: true } } },
  });
  const doc = note?.notePayload?.tiptapJson as JSONContent | null | undefined;
  if (!doc || typeof doc !== "object") return [];
  const parsed = parseCharter(doc);
  const references = [
    ...parsed.standingRules.references,
    ...parsed.phases.flatMap((p) => p.references),
  ];
  if (references.length === 0) return [];
  const ids = references
    .map((r) => r.targetId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  const titles = [...new Set(references.map((r) => r.targetTitle.trim()))];
  const dataNodes = await prisma.contentNode.findMany({
    where: {
      ownerId: ctx.userId,
      contentType: "data",
      deletedAt: null,
      OR: [
        ...(ids.length > 0 ? [{ id: { in: ids } }] : []),
        { title: { in: titles, mode: "insensitive" as const } },
      ],
    },
    select: { id: true, title: true },
  });
  return resolveCharterReferencedTables(references, dataNodes);
}

/**
 * Databases reachable by following RELATION columns out of the ones this
 * chat can already see.
 *
 * The gap this closes (owner report, 2026-09-16): a chat bound to a ledger
 * whose columns read `relation → Experiences`, `relation → Sources` was
 * refused access to Experiences and Sources, and told the user to @-mention
 * them. The schema digest had already NAMED those tables — the model could
 * see the edge and not walk it. A link that is printed in the context but
 * refused by the tools is not a boundary, it is a contradiction.
 *
 * This is the same consent structure as `charterRegistryAuthorizes`, whose
 * note applies verbatim: everything reachable here is the SAME user's own
 * data, still behind `resolveDataTableAccess`. Jurisdiction is a
 * consent-VISIBILITY structure — what the user has pointed this chat at —
 * not a cross-principal security boundary. Pointing a chat at a table the
 * user themselves linked to three others is pointing it at the graph.
 *
 * Inbound edges come free: relations are two-sided, so a table that points
 * AT a visible one has a mirrored backlink column ON the visible one whose
 * `relationTableId` is the source. Walking forward walks both directions.
 *
 * Bounded rather than unbounded: a runaway graph walk would be a quiet
 * performance cliff on a big vault, and depth past a few hops stops being
 * something the user plausibly meant by opening this chat.
 */
const RELATION_REACH_MAX_HOPS = 4;
const RELATION_REACH_MAX_TABLES = 64;

export async function relationReachableTableIds(
  rootIds: string[]
): Promise<Set<string>> {
  const seen = new Set<string>(rootIds);
  let frontier = rootIds.filter(Boolean);

  for (let hop = 0; hop < RELATION_REACH_MAX_HOPS; hop++) {
    if (frontier.length === 0 || seen.size >= RELATION_REACH_MAX_TABLES) break;
    const columns = await prisma.dataColumn.findMany({
      where: {
        tableId: { in: frontier },
        type: "relation",
        deletedAt: null,
      },
      select: { config: true },
    });
    const next: string[] = [];
    for (const column of columns) {
      const config =
        column.config && typeof column.config === "object"
          ? (column.config as Record<string, unknown>)
          : undefined;
      const target = config?.relationTableId;
      if (typeof target !== "string" || seen.has(target)) continue;
      if (seen.size >= RELATION_REACH_MAX_TABLES) break;
      seen.add(target);
      next.push(target);
    }
    frontier = next;
  }
  return seen;
}

/**
 * The tables this chat can see WITHOUT following any relation — the roots
 * of the walk above: the bound table, every @-mentioned one, the charter's
 * master ledger, and every database the charter's body names (P1). The
 * master used to be claimed here and reached only through
 * `charterRegistryAuthorizes`; now it is a root too, so its neighbours are
 * one hop away like everything else's.
 */
async function jurisdictionRoots(ctx: DataToolContext): Promise<string[]> {
  const roots = new Set<string>();
  const bound = await boundTableIdFor(ctx);
  if (bound) roots.add(bound);
  if (ctx.boundContentId) roots.add(ctx.boundContentId);
  if (ctx.contentId) roots.add(ctx.contentId);
  if (ctx.activeCharter) {
    const charterNote = await prisma.contentNode.findFirst({
      where: { id: ctx.activeCharter.contentId, ownerId: ctx.userId, deletedAt: null },
      select: { notePayload: { select: { metadata: true } } },
    });
    const meta =
      charterNote?.notePayload?.metadata &&
      typeof charterNote.notePayload.metadata === "object"
        ? (charterNote.notePayload.metadata as Record<string, unknown>)
        : undefined;
    if (typeof meta?.masterLedgerId === "string") roots.add(meta.masterLedgerId);
    for (const id of await charterReferencedTableIds(ctx)) roots.add(id);
  }
  if (ctx.conversationId) {
    const assocs = await prisma.conversationAssociation.findMany({
      where: { conversationId: ctx.conversationId },
      select: { contentNodeId: true },
    });
    for (const a of assocs) roots.add(a.contentNodeId);
  }

  // Databases created UNDER this chat (outputLocation "under_chat" nests
  // them with role "referenced" + ownedByNoteId = the chat node). Applying
  // a proposal writes no ConversationAssociation, so without this the model
  // cannot read back the table the user just let it create — the one table
  // it is most certain to want next.
  const hosts = [ctx.boundContentId, ctx.contentId].filter(
    (v): v is string => typeof v === "string"
  );
  if (hosts.length > 0) {
    const owned = await prisma.contentNode.findMany({
      where: {
        ownedByNoteId: { in: hosts },
        contentType: "data",
        deletedAt: null,
      },
      select: { id: true },
    });
    for (const n of owned) roots.add(n.id);
  }
  return [...roots];
}

/** True when `databaseId` is reachable by relation from this chat's roots. */
export async function relationGraphAuthorizes(
  ctx: DataToolContext,
  databaseId: string
): Promise<boolean> {
  const roots = await jurisdictionRoots(ctx);
  if (roots.length === 0) return false;
  const reachable = await relationReachableTableIds(roots);
  return reachable.has(databaseId);
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
    if (
      !assoc &&
      !(await charterRegistryAuthorizes(ctx, databaseId)) &&
      !(await relationGraphAuthorizes(ctx, databaseId))
    ) {
      return {
        refusal:
          "That database is not associated with this conversation — tools reach only associated databases, the ones they link to, and the ones the attached charter names. Ask the user to @-mention it (or open the chat from the database) first." +
          // P2: a charter run must not "work around" a missing input. The
          // loop's never-stop rule has exactly this exception, and the
          // refusal is where the model reads it.
          (ctx.activeCharter
            ? " If the charter lists this database as an INPUT, do NOT substitute, infer, or draft without it — stop the run here, tell the user which database to @-mention, and end the turn. Recorded progress is preserved; the run resumes from the first pending item."
            : ""),
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
        "No database given and this chat isn't open on one — pass databaseId (the id from the mention capsule), or find it first with search_content (types: [\"data\"]).",
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
      refusal: `More than one database is named "${trimmed}" — run search_content (types: ["data"]) and pass the right id.`,
    };
  }
  return {
    refusal: `No database named "${trimmed}". Do NOT guess another name — run search_content (types: ["data"]) to see the real ones, then pass an id from the results. If none of them is what the user meant, ask them.`,
  };
}

// ── Row references (AI bulk reads, plan §4.3) ───────────────────────────

/**
 * Resolve a model-supplied row reference — a full UUID or an 8+ hex
 * handle (the `[ab12cd34]` at the start of every query_database line) —
 * against ONE table's live rows. Ambiguity and absence are teaching
 * refusals, never guesses: the write tools call this before touching a
 * row, and a prefix that matches two rows must not pick either.
 */
export async function resolveRowRef(
  tableId: string,
  ref: string
): Promise<{ id: string } | { refusal: string }> {
  const results = await resolveRowRefs(tableId, [ref]);
  return results[0];
}

/** Batch form — one query for a whole list of references. */
export async function resolveRowRefs(
  tableId: string,
  refs: string[]
): Promise<Array<{ id: string } | { refusal: string }>> {
  const parsed = refs.map(parseRowRef);
  const prefixes = parsed.filter((p) => p.kind === "prefix").map((p) => p.prefix);
  const uuids = parsed.filter((p) => p.kind === "uuid").map((p) => p.id);
  const liveIds = new Set<string>();
  if (uuids.length > 0) {
    const rows = await prisma.dataRow.findMany({
      where: { tableId, deletedAt: null, id: { in: uuids } },
      select: { id: true },
    });
    for (const r of rows) liveIds.add(r.id);
  }
  if (prefixes.length > 0) {
    // uuid columns have no `startsWith`; the text cast is cheap at the
    // design scale (≤10k rows) and a wrong-shaped prefix cannot inject —
    // it was validated as hex above.
    const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "DataRow"
      WHERE "tableId" = ${tableId}::uuid AND "deletedAt" IS NULL
        AND ${Prisma.join(prefixes.map((p) => Prisma.sql`"id"::text LIKE ${p + "%"}`), " OR ")}
    `);
    for (const r of rows) liveIds.add(r.id);
  }
  return refs.map((ref) => {
    const m = matchRowRef(ref, liveIds);
    if ("id" in m) return { id: m.id };
    if ("invalid" in m) return { refusal: m.invalid };
    if ("ambiguous" in m) {
      return {
        refusal: `"${ref}" matches ${m.ambiguous.length} rows here (${m.ambiguous
          .map((id) => id.slice(0, 12))
          .join(", ")}) — pass a longer handle or the full row id from query_database.`,
      };
    }
    return {
      refusal: `"${ref}" is not a live row of this database — take the handle from a query_database result line.`,
    };
  });
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
