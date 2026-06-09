/**
 * Conversation Service
 *
 * Server-only CRUD over the Conversation / ConversationMessage /
 * ConversationAssociation tables. Every operation is ownership-gated
 * — queries filter on `ownerId` so users can never read or mutate
 * another user's conversations.
 *
 * Session 2 scope: create, get, list, append, update, soft-delete.
 * Association mutation (mention/tool-call auto, manual pin) lives in
 * Session 4. Archive-to-ContentNode and edit/branch lineage land later.
 *
 * Telemetry: lightweight `conv.*` span events per the plan's
 * observability standards. State changes only — no per-message events.
 */

import "server-only";
import { prisma } from "@/lib/database/client";
import { Prisma } from "@/lib/database/generated/prisma";
import { logger } from "@/lib/core/logger";
import { generateUniqueSlug } from "@/lib/domain/content/slug";
import { publishConversationEvent } from "./events";
import type {
  AppendMessageInput,
  ConversationDetail,
  ConversationMessageView,
  ConversationAssociationView,
  ConversationSummary,
  CreateConversationInput,
  ListConversationsOptions,
  UpdateConversationPatch,
} from "./types";

/** Thrown when a conversation lookup matches a row not owned by the requester. */
export class ConversationNotFoundError extends Error {
  constructor(id: string) {
    super(`Conversation ${id} not found`);
    this.name = "ConversationNotFoundError";
  }
}

const DEFAULT_LIST_LIMIT = 25;
const MAX_LIST_LIMIT = 100;

// ────────────────────────────────────────────────────────────────────────────
// Read
// ────────────────────────────────────────────────────────────────────────────

/**
 * List a user's conversations, most recently updated first.
 *
 * When `forContentNodeIds` is provided, only conversations associated
 * with any of those nodes are returned — this is the sidebar query.
 * Soft-deleted conversations (`deletedAt IS NOT NULL`) are excluded.
 */
export async function listConversations(
  userId: string,
  options: ListConversationsOptions = {},
): Promise<ConversationSummary[]> {
  const limit = Math.min(
    options.limit ?? DEFAULT_LIST_LIMIT,
    MAX_LIST_LIMIT,
  );

  const where: Prisma.ConversationWhereInput = {
    ownerId: userId,
    deletedAt: null,
  };

  if (options.forContentNodeIds && options.forContentNodeIds.length > 0) {
    where.associations = {
      some: { contentNodeId: { in: options.forContentNodeIds } },
    };
  }

  const cursorClause: Pick<Prisma.ConversationFindManyArgs, "cursor" | "skip"> =
    options.cursor
      ? { cursor: { id: options.cursor }, skip: 1 }
      : {};

  const rows = await prisma.conversation.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: limit,
    ...cursorClause,
    select: {
      id: true,
      title: true,
      archivedToContentNodeId: true,
      activeContextId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return rows.map(toSummary);
}

/** Get a single conversation with messages + associations. */
export async function getConversation(
  userId: string,
  conversationId: string,
): Promise<ConversationDetail> {
  const row = await prisma.conversation.findFirst({
    where: { id: conversationId, ownerId: userId, deletedAt: null },
    include: {
      messages: {
        where: { isHidden: false },
        orderBy: { createdAt: "asc" },
      },
      associations: true,
    },
  });

  if (!row) throw new ConversationNotFoundError(conversationId);

  return {
    ...toSummary(row),
    messages: row.messages.map(toMessageView),
    associations: row.associations.map(toAssociationView),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Write
// ────────────────────────────────────────────────────────────────────────────

/**
 * Create a conversation, optionally with snapshot associations.
 *
 * Snapshot association validation: only `contentNodeIds` owned by the
 * user and not soft-deleted are written. Invalid ids are dropped
 * silently — the picker shouldn't break on stale panel state.
 */
export async function createConversation(
  userId: string,
  input: CreateConversationInput = {},
): Promise<ConversationDetail> {
  // ─── Promotion path ───
  // When `fromContentNodeId` is set, this is a "promote archived chat
  // ContentNode to live Conversation" operation. Idempotent: if a
  // Conversation already points back at the same ContentNode via
  // `archivedToContentNodeId`, that conversation is reused (we just
  // add the new snapshot associations and return).
  if (input.fromContentNodeId) {
    return promoteContentNodeToConversation(userId, input);
  }

  const snapshotIds = Array.from(
    new Set(input.snapshotContentNodeIds ?? []),
  );

  // Pre-validate snapshot ids in a single query — drop any that aren't
  // owned by this user or are soft-deleted.
  let validSnapshotIds: string[] = [];
  if (snapshotIds.length > 0) {
    const found = await prisma.contentNode.findMany({
      where: {
        id: { in: snapshotIds },
        ownerId: userId,
        deletedAt: null,
      },
      select: { id: true },
    });
    validSnapshotIds = found.map((c) => c.id);
  }

  const row = await prisma.conversation.create({
    data: {
      ownerId: userId,
      title: input.title ?? null,
      associations: validSnapshotIds.length
        ? {
            create: validSnapshotIds.map((contentNodeId) => ({
              contentNodeId,
              source: "snapshot" as const,
            })),
          }
        : undefined,
    },
    include: {
      messages: true,
      associations: true,
    },
  });

  logger.info({
    layer: "ai",
    event: "conv.create",
    summary: `conversation created (${validSnapshotIds.length} snapshot assoc)`,
    attrs: {
      conversation_id: row.id,
      snapshot_count: validSnapshotIds.length,
    },
  });

  publishConversationEvent(userId, {
    type: "conversation.created",
    conversationId: row.id,
    contentNodeIds: validSnapshotIds,
    at: new Date().toISOString(),
  });

  return {
    ...toSummary(row),
    messages: row.messages.map(toMessageView),
    associations: row.associations.map(toAssociationView),
  };
}

/**
 * Promote a `chat`-type ContentNode (legacy "Save conversation" output)
 * into a first-class Conversation. Copies the stored messages into
 * ConversationMessage rows and links the new conversation back to its
 * source via `archivedToContentNodeId`. Idempotent on that link —
 * picking the same archived chat twice reuses the same Conversation
 * rather than producing duplicates.
 */
async function promoteContentNodeToConversation(
  userId: string,
  input: CreateConversationInput,
): Promise<ConversationDetail> {
  const fromId = input.fromContentNodeId!;
  const snapshotIds = Array.from(
    new Set(input.snapshotContentNodeIds ?? []),
  );

  // Reuse existing if already promoted. We must match ANY conversation
  // archived to this node — including soft-deleted ones — because
  // `archivedToContentNodeId` is unique: a trashed conversation still
  // occupies it, so skipping it and creating a new row would violate the
  // constraint. If the match is soft-deleted (the chat's conversation was
  // trashed but the node lives on), restore it — re-opening/re-pinning a
  // chat should resurrect its conversation.
  const existing = await prisma.conversation.findFirst({
    where: {
      ownerId: userId,
      archivedToContentNodeId: fromId,
    },
    include: { messages: true, associations: true },
  });

  if (existing) {
    if (existing.deletedAt) {
      await prisma.conversation.update({
        where: { id: existing.id },
        data: { deletedAt: null },
      });
    }
    // Top up the snapshot associations to current panel set.
    if (snapshotIds.length > 0) {
      const validSnapshots = await prisma.contentNode.findMany({
        where: {
          id: { in: snapshotIds },
          ownerId: userId,
          deletedAt: null,
        },
        select: { id: true },
      });
      const validIds = validSnapshots.map((c) => c.id);
      for (const cid of validIds) {
        await prisma.conversationAssociation.upsert({
          where: {
            conversationId_contentNodeId: {
              conversationId: existing.id,
              contentNodeId: cid,
            },
          },
          update: {
            source: "manual" as const,
            lastReferencedAt: new Date(),
          },
          create: {
            conversationId: existing.id,
            contentNodeId: cid,
            source: "manual" as const,
          },
        });
      }
    }
    const reread = await prisma.conversation.findUniqueOrThrow({
      where: { id: existing.id },
      include: { messages: true, associations: true },
    });
    // Re-pinned an existing promoted chat — surface as a create so any
    // sidebar bound to these content nodes refreshes its tab list.
    publishConversationEvent(userId, {
      type: "conversation.created",
      conversationId: reread.id,
      contentNodeIds: reread.associations.map((a) => a.contentNodeId),
      at: new Date().toISOString(),
    });
    return {
      ...toSummary(reread),
      messages: reread.messages.map(toMessageView),
      associations: reread.associations.map(toAssociationView),
    };
  }

  // Fetch source ContentNode + ChatPayload (ownership-gated).
  const source = await prisma.contentNode.findFirst({
    where: { id: fromId, ownerId: userId, deletedAt: null },
    include: { chatPayload: true },
  });
  if (!source || !source.chatPayload) {
    throw new Error(`Chat ContentNode ${fromId} not found or has no payload`);
  }

  // Translate stored chat messages → ConversationMessage rows.
  // The legacy payload shape is { role, content, parts?, model?, metadata? }.
  interface StoredMsg {
    id?: string;
    role: string;
    content?: string;
    parts?: unknown[];
    createdAt?: string;
  }
  const stored = (source.chatPayload.messages as unknown as StoredMsg[]) ?? [];
  const metadata =
    (source.chatPayload.metadata as Record<string, unknown>) ?? {};
  const sourceProvider =
    typeof metadata.providerId === "string" ? metadata.providerId : null;
  const sourceModel =
    typeof metadata.modelId === "string" ? metadata.modelId : null;

  // Validate snapshots once
  let validSnapshotIds: string[] = [];
  if (snapshotIds.length > 0) {
    const found = await prisma.contentNode.findMany({
      where: {
        id: { in: snapshotIds },
        ownerId: userId,
        deletedAt: null,
      },
      select: { id: true },
    });
    validSnapshotIds = found.map((c) => c.id);
  }

  const messagesCreate = stored
    .filter(
      (m) =>
        m.role === "user" || m.role === "assistant" || m.role === "system",
    )
    .map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      providerId: sourceProvider,
      modelId: sourceModel,
      // Use the stored parts when present (already in UIMessage shape),
      // otherwise wrap the content string as a single text part.
      parts: (m.parts && Array.isArray(m.parts) && m.parts.length > 0
        ? m.parts
        : [{ type: "text", text: m.content ?? "" }]) as never,
      textCache: m.content ?? null,
    }));

  const row = await prisma.conversation.create({
    data: {
      ownerId: userId,
      title: input.title ?? source.title ?? null,
      archivedToContentNodeId: fromId,
      messages: { create: messagesCreate },
      associations: validSnapshotIds.length
        ? {
            create: validSnapshotIds.map((contentNodeId) => ({
              contentNodeId,
              source: "manual" as const,
            })),
          }
        : undefined,
    },
    include: { messages: true, associations: true },
  });

  logger.info({
    layer: "ai",
    event: "conv.create",
    summary: `conversation promoted from content node (${messagesCreate.length} msgs)`,
    attrs: {
      conversation_id: row.id,
      promoted_from: fromId,
      message_count: messagesCreate.length,
      snapshot_count: validSnapshotIds.length,
    },
  });

  publishConversationEvent(userId, {
    type: "conversation.created",
    conversationId: row.id,
    contentNodeIds: validSnapshotIds,
    at: new Date().toISOString(),
  });

  return {
    ...toSummary(row),
    messages: row.messages.map(toMessageView),
    associations: row.associations.map(toAssociationView),
  };
}

/**
 * Resolve the live Conversation id for a chat-type ContentNode, via the
 * `archivedToContentNodeId` back-link set during promotion. Returns null
 * when the chat was never promoted (legacy ChatPayload only) — callers
 * treat that as "no reverse-view chips to show." Ownership-gated.
 */
export async function findConversationIdByArchivedContent(
  userId: string,
  contentNodeId: string,
): Promise<string | null> {
  const conv = await prisma.conversation.findFirst({
    where: {
      ownerId: userId,
      archivedToContentNodeId: contentNodeId,
      deletedAt: null,
    },
    select: { id: true },
  });
  return conv?.id ?? null;
}

/**
 * Ensure a chat ContentNode exists that hosts this conversation, so it
 * can be opened in the full-page ChatViewer (which is keyed by a
 * ContentNode). Returns the node id.
 *
 * - If the conversation is already archive-linked to a live node, returns
 *   that node (idempotent — repeated "open in full view" reuses it).
 * - Otherwise creates a `chat` ContentNode with an empty ChatPayload and
 *   links the conversation via `archivedToContentNodeId`. ChatViewer runs
 *   conversation-first, so the empty payload is just a host shell — the
 *   live messages come from the Conversation.
 *
 * Ownership-gated.
 */
export async function ensureConversationContentNode(
  userId: string,
  conversationId: string,
): Promise<string> {
  const conv = await prisma.conversation.findFirst({
    where: { id: conversationId, ownerId: userId, deletedAt: null },
    select: { id: true, title: true, archivedToContentNodeId: true },
  });
  if (!conv) throw new ConversationNotFoundError(conversationId);

  if (conv.archivedToContentNodeId) {
    const existing = await prisma.contentNode.findFirst({
      where: {
        id: conv.archivedToContentNodeId,
        ownerId: userId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (existing) return existing.id;
    // Link points at a deleted/missing node — fall through and re-create.
  }

  const title = conv.title?.trim() || "Chat";
  const slug = await generateUniqueSlug(title, userId);

  const node = await prisma.contentNode.create({
    data: {
      ownerId: userId,
      title,
      slug,
      contentType: "chat",
      chatPayload: {
        create: {
          messages: [] as unknown as Prisma.InputJsonValue,
          metadata: {} as unknown as Prisma.InputJsonValue,
        },
      },
    },
    select: { id: true },
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { archivedToContentNodeId: node.id },
  });

  logger.info({
    layer: "ai",
    event: "conv.materialize",
    summary: `materialized content node for conversation ${conversationId}`,
    attrs: { conversation_id: conversationId, content_node_id: node.id },
  });

  return node.id;
}

/** Patch a conversation's mutable metadata (title only in Session 2). */
export async function updateConversation(
  userId: string,
  conversationId: string,
  patch: UpdateConversationPatch,
): Promise<ConversationSummary> {
  // Validate context ownership before linking — never trust a client
  // id. `null` is allowed (clears the link); a non-null id must resolve
  // to a live context owned by this user.
  if (
    "activeContextId" in patch &&
    patch.activeContextId != null
  ) {
    const owned = await prisma.chatContext.findFirst({
      where: { id: patch.activeContextId, ownerId: userId, deletedAt: null },
      select: { id: true },
    });
    if (!owned) throw new ConversationNotFoundError(patch.activeContextId);
  }

  // Ownership gate: updateMany returns count = 0 if the row doesn't
  // belong to this user, leaving the DB untouched. Then we re-read.
  const { count } = await prisma.conversation.updateMany({
    where: { id: conversationId, ownerId: userId, deletedAt: null },
    data: {
      title: patch.title ?? undefined,
      // Explicit `in patch` test so `null` clears the link rather than
      // being coalesced to "no change".
      ...("activeContextId" in patch && {
        activeContextId: patch.activeContextId ?? null,
      }),
    },
  });

  if (count === 0) throw new ConversationNotFoundError(conversationId);

  const row = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    select: {
      id: true,
      title: true,
      archivedToContentNodeId: true,
      activeContextId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  // Keep the backing chat ContentNode's title in sync so the file tree
  // and workspace tabs (both ContentNode-driven) reflect the rename. Only
  // when the conversation is archive-linked and we're setting a real
  // title — never blank the node title on a null patch.
  if (row.archivedToContentNodeId && patch.title) {
    await prisma.contentNode.updateMany({
      where: { id: row.archivedToContentNodeId, ownerId: userId },
      data: { title: patch.title },
    });
  }

  publishConversationEvent(userId, {
    type: "conversation.updated",
    conversationId,
    title: row.title,
    at: new Date().toISOString(),
  });

  return toSummary(row);
}

/** Soft-delete a conversation. Messages and associations cascade via FK. */
export async function softDeleteConversation(
  userId: string,
  conversationId: string,
): Promise<void> {
  const { count } = await prisma.conversation.updateMany({
    where: { id: conversationId, ownerId: userId, deletedAt: null },
    data: { deletedAt: new Date() },
  });

  if (count === 0) throw new ConversationNotFoundError(conversationId);

  publishConversationEvent(userId, {
    type: "conversation.deleted",
    conversationId,
    at: new Date().toISOString(),
  });
}

/**
 * Append a message to a conversation.
 *
 * Verifies ownership before inserting. Bumps the conversation's
 * `updatedAt` so the sidebar tab ordering reflects recency.
 */
export async function appendMessage(
  userId: string,
  conversationId: string,
  message: AppendMessageInput,
): Promise<ConversationMessageView> {
  // Ownership gate. Use findFirst + select to keep it cheap.
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, ownerId: userId, deletedAt: null },
    select: { id: true },
  });

  if (!conversation) throw new ConversationNotFoundError(conversationId);

  const [created] = await prisma.$transaction([
    prisma.conversationMessage.create({
      data: {
        id: message.id,
        conversationId,
        role: message.role,
        providerId: message.providerId ?? null,
        modelId: message.modelId ?? null,
        // Prisma's JSON input type is intentionally narrow; cast via unknown.
        parts: message.parts as unknown as Prisma.InputJsonValue,
        textCache: message.textCache ?? null,
        parentId: message.parentId ?? null,
        metadata: message.metadata
          ? (message.metadata as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    }),
    prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
      select: { id: true },
    }),
  ]);

  publishConversationEvent(userId, {
    type: "message.appended",
    conversationId,
    providerId: message.providerId ?? null,
    modelId: message.modelId ?? null,
    at: new Date().toISOString(),
  });

  return toMessageView(created);
}

/**
 * Fork (branch) a conversation into a new one. Copies the source's
 * non-hidden messages — all of them, or up to and including
 * `uptoMessageId` — into a fresh Conversation, and mirrors the source's
 * associations as `snapshot` rows so the branch surfaces alongside the
 * original in the same content's sidebar.
 *
 * Use cases: explore an alternate direction from a point in the chat
 * without disturbing the original thread.
 *
 * Returns the new conversation's id. Ownership-gated.
 */
export async function forkConversation(
  userId: string,
  sourceConversationId: string,
  uptoMessageId?: string,
): Promise<string> {
  const source = await prisma.conversation.findFirst({
    where: { id: sourceConversationId, ownerId: userId, deletedAt: null },
    select: {
      id: true,
      title: true,
      associations: { select: { contentNodeId: true } },
    },
  });
  if (!source) throw new ConversationNotFoundError(sourceConversationId);

  // Resolve the cutoff timestamp (inclusive) when a message anchor is given.
  let cutoff: Date | null = null;
  if (uptoMessageId) {
    const anchor = await prisma.conversationMessage.findFirst({
      where: { id: uptoMessageId, conversationId: sourceConversationId },
      select: { createdAt: true },
    });
    cutoff = anchor?.createdAt ?? null;
  }

  const sourceMessages = await prisma.conversationMessage.findMany({
    where: {
      conversationId: sourceConversationId,
      isHidden: false,
      ...(cutoff ? { createdAt: { lte: cutoff } } : {}),
    },
    orderBy: { createdAt: "asc" },
    select: {
      role: true,
      providerId: true,
      modelId: true,
      parts: true,
      textCache: true,
    },
  });

  const baseTitle = source.title?.trim() || "Chat";
  const forkTitle =
    baseTitle.length > 240 ? baseTitle.slice(0, 240) : baseTitle;

  // Estimated byte size of the parts JSON we're about to write — a useful
  // signal in error logs when an Insert blows past timeouts (typically
  // very long conversations with image attachments). Cheap upper bound:
  // a JSON.stringify cost is paid by Prisma anyway.
  const partsBytes = sourceMessages.reduce(
    (sum, m) => sum + JSON.stringify(m.parts ?? "").length,
    0,
  );

  let created: { id: string };
  try {
    created = await prisma.conversation.create({
      data: {
        ownerId: userId,
        title: `${forkTitle} (branch)`.slice(0, 255),
        messages: {
          create: sourceMessages.map((m) => ({
            role: m.role,
            providerId: m.providerId,
            modelId: m.modelId,
            parts: m.parts as unknown as Prisma.InputJsonValue,
            textCache: m.textCache,
          })),
        },
        associations: source.associations.length
          ? {
              create: source.associations.map((a) => ({
                contentNodeId: a.contentNodeId,
                source: "snapshot" as const,
              })),
            }
          : undefined,
      },
      select: { id: true },
    });
  } catch (error) {
    // Re-throw after attaching diagnostic attrs so the route handler's
    // catch sees them in the error log. Without this, prod failures
    // surface as "Fork failed" with no context about size or shape.
    logger.warn({
      layer: "ai",
      event: "conv.fork.create_failed",
      summary: `Prisma create threw during fork of ${sourceConversationId}`,
      attrs: {
        source_id: sourceConversationId,
        message_count: sourceMessages.length,
        parts_bytes_estimate: partsBytes,
        association_count: source.associations.length,
        upto: uptoMessageId ?? "none",
      },
      error,
    });
    throw error;
  }

  logger.info({
    layer: "ai",
    event: "conv.fork",
    summary: `forked conversation ${sourceConversationId} → ${created.id}`,
    attrs: {
      source_id: sourceConversationId,
      new_id: created.id,
      message_count: sourceMessages.length,
      parts_bytes_estimate: partsBytes,
      upto: uptoMessageId ?? "none",
    },
  });

  publishConversationEvent(userId, {
    type: "conversation.created",
    conversationId: created.id,
    contentNodeIds: source.associations.map((a) => a.contentNodeId),
    at: new Date().toISOString(),
  });

  return created.id;
}

/**
 * Soft-hide a message and everything created after it (edit / regenerate
 * supersession). Implements the reconcile model: after hiding, the
 * conversation's non-hidden rows match the client's truncated view, and
 * the new branch is appended via `appendMessage`.
 *
 * `inclusive` controls whether the anchor message itself is hidden:
 *   - edit a user message → inclusive (the old user turn is replaced)
 *   - regenerate an assistant message → inclusive (the old answer is replaced)
 *
 * Returns the number of rows hidden. Ownership-gated; unknown ids no-op.
 */
export async function hideMessagesFrom(
  userId: string,
  conversationId: string,
  fromMessageId: string,
  inclusive: boolean,
): Promise<number> {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, ownerId: userId, deletedAt: null },
    select: { id: true },
  });
  if (!conversation) throw new ConversationNotFoundError(conversationId);

  const anchor = await prisma.conversationMessage.findFirst({
    where: { id: fromMessageId, conversationId },
    select: { createdAt: true },
  });
  if (!anchor) return 0; // unknown / already-gone anchor — nothing to do

  const { count } = await prisma.conversationMessage.updateMany({
    where: {
      conversationId,
      isHidden: false,
      OR: [
        { createdAt: { gt: anchor.createdAt } },
        ...(inclusive ? [{ id: fromMessageId }] : []),
      ],
    },
    data: { isHidden: true },
  });

  return count;
}

// ────────────────────────────────────────────────────────────────────────────
// Mapping helpers (Date → ISO string boundary)
// ────────────────────────────────────────────────────────────────────────────

type ConversationRow = {
  id: string;
  title: string | null;
  archivedToContentNodeId: string | null;
  activeContextId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function toSummary(row: ConversationRow): ConversationSummary {
  return {
    id: row.id,
    title: row.title,
    archivedToContentNodeId: row.archivedToContentNodeId,
    activeContextId: row.activeContextId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lastMessageAt: row.updatedAt.toISOString(),
  };
}

type MessageRow = {
  id: string;
  role: ConversationMessageView["role"];
  providerId: string | null;
  modelId: string | null;
  parts: unknown;
  textCache: string | null;
  parentId: string | null;
  isHidden: boolean;
  metadata: unknown;
  createdAt: Date;
};

function toMessageView(row: MessageRow): ConversationMessageView {
  return {
    id: row.id,
    role: row.role,
    providerId: row.providerId,
    modelId: row.modelId,
    parts: row.parts,
    textCache: row.textCache,
    parentId: row.parentId,
    isHidden: row.isHidden,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
  };
}

type AssociationRow = {
  conversationId: string;
  contentNodeId: string;
  source: ConversationAssociationView["source"];
  lastReferencedAt: Date;
  referenceCount: number;
  createdAt: Date;
};

function toAssociationView(row: AssociationRow): ConversationAssociationView {
  return {
    conversationId: row.conversationId,
    contentNodeId: row.contentNodeId,
    source: row.source,
    lastReferencedAt: row.lastReferencedAt.toISOString(),
    referenceCount: row.referenceCount,
    createdAt: row.createdAt.toISOString(),
  };
}
