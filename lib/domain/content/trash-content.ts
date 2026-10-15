/**
 * Move one content node to the trash — the single path for every caller
 * (the content DELETE route, the MCP `garden_delete_content` tool), so an
 * agent's delete gets exactly the trash entry and cleanup a user's does.
 *
 * Extracted verbatim from `DELETE /api/content/content/[id]` (2026-10-14):
 * soft delete + TrashBin upsert (30-day schedule) in one transaction, then
 * best-effort cascades — owned side chats and their outputs, the chat's
 * backing Conversation, the parent's AI-context dirty flag, workspace pane
 * state, n8n webhooks, and orphaned generated/embedded media. A cascade
 * hiccup never fails the primary delete. Restorable from the trash for 30
 * days (lib/features/trash).
 *
 * Server-only.
 */

import { after } from "next/server";
import { prisma } from "@/lib/database/client";
import { logger } from "@/lib/core/logger";
import { markContextDirty } from "@/lib/domain/ai-context/context-dirty";
import { softDeleteIfOrphaned } from "@/lib/domain/content/image-refs";
import { invalidateCachedContent } from "@/lib/domain/content/content-cache";
import { softDeleteConversation } from "@/lib/features/conversations";

const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export interface TrashContentOutcome {
  ok: boolean;
  /** "not_found" | "forbidden" when not ok. */
  error?: "not_found" | "forbidden";
  id?: string;
  title?: string;
  contentType?: string;
  deletedAt?: Date;
  scheduledDeletion?: Date;
}

export async function trashContentNode(ownerId: string, id: string): Promise<TrashContentOutcome> {
  const existing = await prisma.contentNode.findUnique({
    where: { id },
    include: { children: { select: { id: true } } },
  });
  if (!existing) return { ok: false, error: "not_found" };
  if (existing.ownerId !== ownerId) return { ok: false, error: "forbidden" };

  const now = new Date();
  const scheduledDeletion = new Date(now.getTime() + TRASH_RETENTION_MS);
  const snapshot = {
    title: existing.title,
    slug: existing.slug,
    parentId: existing.parentId,
    hasChildren: existing.children.length > 0,
  };

  await prisma.$transaction([
    prisma.contentNode.update({
      where: { id },
      data: { deletedAt: now, deletedBy: ownerId },
    }),
    // Upsert, not create: contentId is unique and a delete→restore→delete
    // cycle used to leave the old row behind, making every re-delete 500 on
    // the constraint ("undeletable" content whose delete silently did nothing).
    prisma.trashBin.upsert({
      where: { contentId: id },
      create: { contentId: id, deletedBy: ownerId, scheduledDeletion, contentSnapshot: snapshot },
      update: { deletedBy: ownerId, deletedAt: now, scheduledDeletion, contentSnapshot: snapshot },
    }),
  ]);

  // Drop the cache entry so the next GET observes the soft-delete instead of
  // returning a stale cached copy.
  invalidateCachedContent(id);

  // WS6 (Chat Outputs & References): cascade down the ownership chain — a
  // deleted node's owned side chats (and the outputs those chats generated)
  // go with it, and each chat's Conversation is soft-deleted too.
  try {
    await cascadeOwnedDeletes(id, ownerId, now);
    if (existing.contentType === "chat") {
      const conv = await prisma.conversation.findFirst({
        where: { archivedToContentNodeId: id, ownerId, deletedAt: null },
        select: { id: true },
      });
      if (conv) await softDeleteConversation(ownerId, conv.id).catch(() => null);
    }
  } catch (error) {
    logger.warn({
      layer: "route",
      event: "content.delete.cascade_failed",
      summary: `WS6 owned-delete cascade failed for ${id}`,
      error,
    });
  }

  // Folder Studio auto-context: removal changes the parent's roll-up inputs.
  after(() => markContextDirty([existing.parentId]));

  // Scrub the node from every workspace's saved pane state, or a workspace
  // snapshot restore resurrects the deleted node's tab.
  try {
    const { removeContentFromWorkspaces } = await import("@/extensions/workplaces/server/service");
    await removeContentFromWorkspaces(ownerId, id);
  } catch (error) {
    logger.warn({
      layer: "route",
      event: "content.delete.workspace_scrub_failed",
      summary: `failed to scrub ${id} from workspaces`,
      attrs: { content_id: id },
      error,
    });
  }

  // n8n Flows own an engine-side workflow whose production webhook stays
  // live otherwise. Trash = deactivate (restore reactivates; purge tears down).
  if (existing.contentType === "workflow") {
    try {
      const { deactivateN8nFlowForContent } = await import("@/extensions/workflows/server/engines/n8n/teardown");
      await deactivateN8nFlowForContent(id);
    } catch (error) {
      logger.warn({
        layer: "route",
        event: "content.delete.n8n_deactivate_failed",
        summary: `failed to deactivate n8n workflow for ${id}`,
        attrs: { content_id: id },
        error,
      });
    }
  }

  // Chat nodes are Conversation-backed: deleting the node deletes the chat.
  // (Retried here in case the cascade above failed before reaching it.)
  if (existing.contentType === "chat") {
    const backing = await prisma.conversation.findFirst({
      where: { archivedToContentNodeId: id, ownerId, deletedAt: null },
      select: { id: true },
    });
    if (backing) {
      await softDeleteConversation(ownerId, backing.id).catch(() => {
        /* best-effort cascade — node delete already succeeded */
      });
    }
  }

  // Generated/embedded media the node owned goes too — but only when nothing
  // else still references it, so a reused image survives.
  try {
    const [ownedEmbeds, embeddedLinks] = await Promise.all([
      prisma.contentNode.findMany({
        where: { ownedByNoteId: id, role: "referenced", deletedAt: null },
        select: { id: true },
      }),
      prisma.contentLink.findMany({
        where: { sourceId: id, linkType: { in: ["image-ref", "audio-ref"] } },
        select: { targetId: true },
      }),
    ]);
    const candidateIds = new Set<string>([...ownedEmbeds.map((n) => n.id), ...embeddedLinks.map((l) => l.targetId)]);
    for (const targetId of candidateIds) {
      await softDeleteIfOrphaned(targetId, ownerId);
    }
  } catch (cascadeError) {
    logger.warn({
      event: "content.delete.media_cascade_failed",
      summary: "generated-media cascade failed (node soft-delete already done)",
      error: cascadeError,
    });
  }

  return {
    ok: true,
    id,
    title: existing.title,
    contentType: existing.contentType,
    deletedAt: now,
    scheduledDeletion,
  };
}

/**
 * WS6 owned-delete cascade: breadth-first soft-delete down the
 * `ownedByNoteId` chain from a just-deleted root (owned side chats, then
 * their outputs…), each chat's Conversation too. Bounded depth guards
 * against cycles. Only EXPLICITLY-owned content.
 */
async function cascadeOwnedDeletes(rootId: string, userId: string, now: Date): Promise<void> {
  let frontier = [rootId];
  const seen = new Set<string>([rootId]);
  for (let depth = 0; depth < 5 && frontier.length > 0; depth++) {
    const owned = await prisma.contentNode.findMany({
      where: { ownedByNoteId: { in: frontier }, ownerId: userId, deletedAt: null },
      select: { id: true, contentType: true },
    });
    const fresh = owned.filter((o) => !seen.has(o.id));
    if (fresh.length === 0) break;
    const ids = fresh.map((o) => o.id);
    for (const id of ids) seen.add(id);

    await prisma.contentNode.updateMany({
      where: { id: { in: ids } },
      data: { deletedAt: now, deletedBy: userId },
    });

    const chatIds = fresh.filter((o) => o.contentType === "chat").map((o) => o.id);
    if (chatIds.length > 0) {
      const convs = await prisma.conversation.findMany({
        where: { archivedToContentNodeId: { in: chatIds }, ownerId: userId, deletedAt: null },
        select: { id: true },
      });
      for (const conv of convs) {
        await softDeleteConversation(userId, conv.id).catch(() => null);
      }
    }

    frontier = ids;
  }
}
