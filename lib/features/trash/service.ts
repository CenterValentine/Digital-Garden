/**
 * Trash service — soft-deleted items + 30-day TTL purge.
 *
 * Surfaces what's already soft-deleted (Conversations + ContentNodes carry
 * `deletedAt`), supports restore + delete-now, and provides the daily-cron
 * purge that hard-deletes anything past the retention window and cleans up
 * its object-storage blobs.
 *
 * Chat attachments are R2 blobs referenced by message file parts; their
 * storage keys are stashed in each file part's `providerMetadata.app.key`
 * (set at send time), so purge can delete them deterministically.
 */

import "server-only";
import { prisma } from "@/lib/database/client";
import { getUserStorageProvider } from "@/lib/infrastructure/storage";
import { logger } from "@/lib/core/logger";

/** Days a soft-deleted item is retained before the cron hard-deletes it. */
export const TRASH_RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type TrashItemKind = "chat" | "content";

export interface TrashItem {
  kind: TrashItemKind;
  id: string;
  title: string | null;
  /** Content node type (note/file/chat/…); null for conversations. */
  contentType: string | null;
  deletedAt: string;
  /** Whole days until auto-purge (0 = purges on the next cron run). */
  daysLeft: number;
}

function daysLeft(deletedAt: Date): number {
  const elapsed = Date.now() - deletedAt.getTime();
  return Math.max(0, TRASH_RETENTION_DAYS - Math.floor(elapsed / DAY_MS));
}

/** List the user's soft-deleted chats + content, newest-deleted first. */
export async function listTrash(userId: string): Promise<TrashItem[]> {
  const [chats, content] = await Promise.all([
    prisma.conversation.findMany({
      where: { ownerId: userId, deletedAt: { not: null } },
      select: { id: true, title: true, deletedAt: true },
      orderBy: { deletedAt: "desc" },
    }),
    prisma.contentNode.findMany({
      where: { ownerId: userId, deletedAt: { not: null } },
      select: { id: true, title: true, contentType: true, deletedAt: true },
      orderBy: { deletedAt: "desc" },
    }),
  ]);

  const items: TrashItem[] = [
    ...chats.map((c) => ({
      kind: "chat" as const,
      id: c.id,
      title: c.title,
      contentType: null,
      deletedAt: c.deletedAt!.toISOString(),
      daysLeft: daysLeft(c.deletedAt!),
    })),
    ...content.map((n) => ({
      kind: "content" as const,
      id: n.id,
      title: n.title,
      contentType: n.contentType,
      deletedAt: n.deletedAt!.toISOString(),
      daysLeft: daysLeft(n.deletedAt!),
    })),
  ];
  items.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  return items;
}

/** Restore a soft-deleted item (clear `deletedAt`). Ownership-gated. */
export async function restoreTrashItem(
  userId: string,
  kind: TrashItemKind,
  id: string,
): Promise<boolean> {
  if (kind === "chat") {
    const { count } = await prisma.conversation.updateMany({
      where: { id, ownerId: userId, deletedAt: { not: null } },
      data: { deletedAt: null },
    });
    return count > 0;
  }
  const { count } = await prisma.contentNode.updateMany({
    where: { id, ownerId: userId, deletedAt: { not: null } },
    data: { deletedAt: null, deletedBy: null },
  });
  return count > 0;
}

/** Permanently delete a single soft-deleted item now. Ownership-gated. */
export async function purgeTrashItem(
  userId: string,
  kind: TrashItemKind,
  id: string,
): Promise<boolean> {
  if (kind === "chat") {
    const conv = await prisma.conversation.findFirst({
      where: { id, ownerId: userId, deletedAt: { not: null } },
      select: { id: true },
    });
    if (!conv) return false;
    await purgeConversationBlobs(userId, id);
    await prisma.conversation.delete({ where: { id } });
    return true;
  }
  const node = await prisma.contentNode.findFirst({
    where: { id, ownerId: userId, deletedAt: { not: null } },
    select: { id: true },
  });
  if (!node) return false;
  await prisma.contentNode.delete({ where: { id } });
  return true;
}

/**
 * Cron entry: hard-delete everything past the retention window across all
 * users, cleaning up chat-attachment blobs first. Returns purge counts.
 */
export async function purgeExpiredTrash(): Promise<{
  chats: number;
  content: number;
}> {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * DAY_MS);

  const expiredChats = await prisma.conversation.findMany({
    where: { deletedAt: { lt: cutoff } },
    select: { id: true, ownerId: true },
  });
  for (const c of expiredChats) {
    try {
      await purgeConversationBlobs(c.ownerId, c.id);
      await prisma.conversation.delete({ where: { id: c.id } });
    } catch (error) {
      logger.warn({
        layer: "ai",
        event: "trash.purge.chat_failed",
        summary: `failed to purge conversation ${c.id}`,
        error,
      });
    }
  }

  const expiredContent = await prisma.contentNode.deleteMany({
    where: { deletedAt: { lt: cutoff } },
  });

  logger.info({
    layer: "ai",
    event: "trash.purge.expired",
    summary: `purged ${expiredChats.length} chats + ${expiredContent.count} content nodes`,
    attrs: { chats: expiredChats.length, content: expiredContent.count },
  });

  return { chats: expiredChats.length, content: expiredContent.count };
}

/**
 * Delete a conversation's attachment blobs from object storage. Best-effort:
 * walks message file parts for `providerMetadata.app.key` and removes each.
 */
async function purgeConversationBlobs(
  ownerId: string,
  conversationId: string,
): Promise<void> {
  const messages = await prisma.conversationMessage.findMany({
    where: { conversationId },
    select: { parts: true },
  });

  const keys = new Set<string>();
  for (const m of messages) {
    if (!Array.isArray(m.parts)) continue;
    for (const part of m.parts as Array<Record<string, unknown>>) {
      if (part?.type !== "file") continue;
      const meta = part.providerMetadata as
        | { app?: { key?: unknown } }
        | undefined;
      const key = meta?.app?.key;
      if (typeof key === "string" && key.length > 0) keys.add(key);
    }
  }
  if (keys.size === 0) return;

  let provider;
  try {
    provider = await getUserStorageProvider(ownerId);
  } catch {
    return; // no storage configured — nothing to clean
  }
  for (const key of keys) {
    try {
      await provider.deleteFile(key);
    } catch (error) {
      logger.warn({
        layer: "storage",
        event: "trash.purge.blob_failed",
        summary: `failed to delete attachment blob ${key}`,
        error,
      });
    }
  }
}
