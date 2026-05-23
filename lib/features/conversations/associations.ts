/**
 * Conversation Association Service — Session 4a.
 *
 * CRUD over `ConversationAssociation`. Three sources, one merged set:
 *   - snapshot : written at conversation creation (handled by service.ts)
 *   - manual   : user-pinned via the picker, or promoted from auto
 *   - auto     : @mention or AI tool-call referencing a content node
 *
 * Manual + snapshot rows are immune to LRU eviction. Auto rows are
 * capped per-conversation and evicted on least-recently-referenced.
 */

import "server-only";
import { prisma } from "@/lib/database/client";
import {
  type ConversationAssociationSource,
} from "@/lib/database/generated/prisma";
import { logger } from "@/lib/core/logger";
import type { ConversationAssociationView } from "./types";
import { publishConversationEvent } from "./events";

/** Per-conversation cap on auto-source associations. */
export const CONVERSATION_AUTO_ASSOC_CAP = 20;

// ────────────────────────────────────────────────────────────────────────────
// Read
// ────────────────────────────────────────────────────────────────────────────

/**
 * List all associations for a conversation, enriched with each content
 * node's title/type/deleted-state for display (the reverse-view chips on
 * the full-page ChatViewer header). The content-node join doesn't filter
 * on `deletedAt` — a soft-deleted target still renders as a dimmed chip
 * rather than vanishing, so the user understands why a pin went stale.
 */
export async function listAssociations(
  userId: string,
  conversationId: string,
): Promise<ConversationAssociationView[]> {
  // Ownership gate via the join — only the user's own conversations match.
  const rows = await prisma.conversationAssociation.findMany({
    where: {
      conversationId,
      conversation: { ownerId: userId, deletedAt: null },
    },
    include: {
      contentNode: {
        select: { title: true, contentType: true, deletedAt: true },
      },
    },
    orderBy: { lastReferencedAt: "desc" },
  });
  return rows.map((row) => ({
    ...toView(row),
    contentTitle: row.contentNode?.title ?? null,
    contentType: row.contentNode?.contentType ?? null,
    contentDeleted: row.contentNode?.deletedAt != null,
  }));
}

/**
 * For a given set of contentNodeIds, return the conversations associated
 * with any of them. Used by the sidebar tab strip to populate tabs for
 * the currently-open panels.
 */
export async function listConversationsByContent(
  userId: string,
  contentNodeIds: string[],
): Promise<
  Array<{
    conversationId: string;
    title: string | null;
    updatedAt: string;
    /** Last *stamped* message's provider id; null if the chat has none yet. */
    lastProviderId: string | null;
    /** Last *stamped* message's model id; null if the chat has none yet. */
    lastModelId: string | null;
    associations: ConversationAssociationView[];
  }>
> {
  if (contentNodeIds.length === 0) return [];

  // Pull the most recent stamped message per conversation in the same
  // query (LATERAL-style) so the sidebar can preload its tab styling
  // without a follow-up fetch. `take: 1` + `orderBy desc` uses the
  // existing (conversationId, createdAt) index; filtering on non-null
  // stamps skips unhelpful legacy/system rows.
  const rows = await prisma.conversation.findMany({
    where: {
      ownerId: userId,
      deletedAt: null,
      associations: { some: { contentNodeId: { in: contentNodeIds } } },
    },
    include: {
      associations: {
        where: { contentNodeId: { in: contentNodeIds } },
      },
      messages: {
        where: {
          isHidden: false,
          providerId: { not: null },
          modelId: { not: null },
        },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { providerId: true, modelId: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return rows.map((r) => ({
    conversationId: r.id,
    title: r.title,
    updatedAt: r.updatedAt.toISOString(),
    lastProviderId: r.messages[0]?.providerId ?? null,
    lastModelId: r.messages[0]?.modelId ?? null,
    associations: r.associations.map(toView),
  }));
}

// ────────────────────────────────────────────────────────────────────────────
// Write
// ────────────────────────────────────────────────────────────────────────────

/**
 * Create a manual (pinned) association between a conversation and a
 * content node. Idempotent: if an association already exists with any
 * source, it's promoted to `manual` (manual is the strongest).
 */
export async function addManualAssociation(
  userId: string,
  conversationId: string,
  contentNodeId: string,
): Promise<ConversationAssociationView> {
  // Ownership gate.
  await assertConversationOwned(userId, conversationId);
  await assertContentNodeOwned(userId, contentNodeId);

  const existing = await prisma.conversationAssociation.findUnique({
    where: {
      conversationId_contentNodeId: { conversationId, contentNodeId },
    },
  });

  const now = new Date();
  if (existing) {
    const updated = await prisma.conversationAssociation.update({
      where: {
        conversationId_contentNodeId: { conversationId, contentNodeId },
      },
      data: {
        source: "manual",
        lastReferencedAt: now,
        referenceCount: { increment: 1 },
      },
    });
    logger.info({
      layer: "ai",
      event: "assoc.promote.manual",
      summary: "association promoted to manual",
      attrs: {
        conversation_id: conversationId,
        content_node_id: contentNodeId,
        prior_source: existing.source,
      },
    });
    publishConversationEvent(userId, {
      type: "association.changed",
      conversationId,
      contentNodeId,
      op: "added",
      source: "manual",
      at: now.toISOString(),
    });
    return toView(updated);
  }

  const created = await prisma.conversationAssociation.create({
    data: {
      conversationId,
      contentNodeId,
      source: "manual",
      lastReferencedAt: now,
      referenceCount: 1,
    },
  });
  logger.info({
    layer: "ai",
    event: "assoc.create",
    summary: "manual association created",
    attrs: {
      conversation_id: conversationId,
      content_node_id: contentNodeId,
      source: "manual",
      via: "picker",
    },
  });
  publishConversationEvent(userId, {
    type: "association.changed",
    conversationId,
    contentNodeId,
    op: "added",
    source: "manual",
    at: now.toISOString(),
  });
  return toView(created);
}

/**
 * Auto-association from @mention or AI tool-call. Upserts the row,
 * bumps lastReferencedAt + referenceCount, and runs LRU eviction
 * within the same transaction.
 *
 * If the row already has source `manual` or `snapshot`, we DO update
 * `lastReferencedAt` (it's a real reference) but we don't downgrade
 * the source.
 */
export async function addAutoAssociation(
  userId: string,
  conversationId: string,
  contentNodeId: string,
  via: "mention" | "tool-call",
): Promise<ConversationAssociationView | null> {
  // Drop silently if not owned — auto-paths shouldn't surface errors.
  try {
    await assertConversationOwned(userId, conversationId);
    await assertContentNodeOwned(userId, contentNodeId);
  } catch {
    return null;
  }

  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.conversationAssociation.findUnique({
      where: {
        conversationId_contentNodeId: { conversationId, contentNodeId },
      },
    });

    let row;
    if (existing) {
      // Bump reference data; preserve source unless we're an auto-on-auto.
      row = await tx.conversationAssociation.update({
        where: {
          conversationId_contentNodeId: { conversationId, contentNodeId },
        },
        data: {
          lastReferencedAt: now,
          referenceCount: { increment: 1 },
          // Only set source if it was already auto.
          ...(existing.source === "auto" ? { source: "auto" as const } : {}),
        },
      });
    } else {
      row = await tx.conversationAssociation.create({
        data: {
          conversationId,
          contentNodeId,
          source: "auto",
          lastReferencedAt: now,
          referenceCount: 1,
        },
      });

      // LRU eviction: count active auto rows for this conversation; if
      // over the cap, drop the least-recently-referenced auto row.
      const autoCount = await tx.conversationAssociation.count({
        where: { conversationId, source: "auto" },
      });
      if (autoCount > CONVERSATION_AUTO_ASSOC_CAP) {
        const stalest = await tx.conversationAssociation.findFirst({
          where: { conversationId, source: "auto" },
          orderBy: { lastReferencedAt: "asc" },
        });
        if (stalest) {
          await tx.conversationAssociation.delete({
            where: {
              conversationId_contentNodeId: {
                conversationId,
                contentNodeId: stalest.contentNodeId,
              },
            },
          });
          logger.info({
            layer: "ai",
            event: "assoc.evict.lru",
            summary: "auto association evicted (LRU)",
            attrs: {
              conversation_id: conversationId,
              evicted_content_node_id: stalest.contentNodeId,
              evicted_age_ms: now.getTime() - stalest.lastReferencedAt.getTime(),
            },
          });
        }
      }
    }
    return row;
  });

  if (result.referenceCount === 1) {
    logger.info({
      layer: "ai",
      event: "assoc.create",
      summary: "auto association created",
      attrs: {
        conversation_id: conversationId,
        content_node_id: contentNodeId,
        source: "auto",
        via,
      },
    });
    // Only emit on a genuinely-new row — bumping an existing reference
    // (referenceCount > 1) doesn't change the association SET, just its
    // recency, so it shouldn't trigger a sidebar refetch storm.
    publishConversationEvent(userId, {
      type: "association.changed",
      conversationId,
      contentNodeId,
      op: "added",
      source: result.source as "snapshot" | "manual" | "auto",
      at: now.toISOString(),
    });
  }
  return toView(result);
}

/** Delete an association by (conversation, content). */
export async function removeAssociation(
  userId: string,
  conversationId: string,
  contentNodeId: string,
): Promise<void> {
  await assertConversationOwned(userId, conversationId);
  await prisma.conversationAssociation.deleteMany({
    where: { conversationId, contentNodeId },
  });
  publishConversationEvent(userId, {
    type: "association.changed",
    conversationId,
    contentNodeId,
    op: "removed",
    source: null,
    at: new Date().toISOString(),
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

async function assertConversationOwned(
  userId: string,
  conversationId: string,
): Promise<void> {
  const conv = await prisma.conversation.findFirst({
    where: { id: conversationId, ownerId: userId, deletedAt: null },
    select: { id: true },
  });
  if (!conv) {
    throw new Error(`Conversation ${conversationId} not found or not owned`);
  }
}

async function assertContentNodeOwned(
  userId: string,
  contentNodeId: string,
): Promise<void> {
  const node = await prisma.contentNode.findFirst({
    where: { id: contentNodeId, ownerId: userId, deletedAt: null },
    select: { id: true },
  });
  if (!node) {
    throw new Error(`ContentNode ${contentNodeId} not found or not owned`);
  }
}

type AssociationRow = {
  conversationId: string;
  contentNodeId: string;
  source: ConversationAssociationSource;
  lastReferencedAt: Date;
  referenceCount: number;
  createdAt: Date;
};

function toView(row: AssociationRow): ConversationAssociationView {
  return {
    conversationId: row.conversationId,
    contentNodeId: row.contentNodeId,
    source: row.source,
    lastReferencedAt: row.lastReferencedAt.toISOString(),
    referenceCount: row.referenceCount,
    createdAt: row.createdAt.toISOString(),
  };
}
