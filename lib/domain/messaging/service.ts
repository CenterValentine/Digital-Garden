/**
 * Messaging domain service — 1:1 DM threads between connected users.
 *
 * Key mechanics:
 * - Threads are unique per user pair via pairKey "<minId>:<maxId>".
 * - Unread tracking is a lastReadAt cursor on DmParticipant (not receipts).
 * - lastActiveAt is a heartbeat the fast poll refreshes; sendMessage skips
 *   the notification projection when the recipient heart-beat is fresh, so
 *   an open conversation never lights the recipient's bell.
 * - markThreadRead also clears "dm.message" notifications for the thread
 *   (markSubjectRead), keeping the bell badge coherent with the thread view.
 */

import { prisma } from "@/lib/database/client";
import { areConnected, isBlockedEitherWay } from "@/lib/domain/connections";
import {
  archiveSubject,
  markSubjectRead,
  publishEvent,
} from "@/lib/domain/notifications";
import {
  consumeRateLimit,
  RATE_LIMITS,
} from "@/lib/infrastructure/rate-limiting";
import { RateLimitExceededError } from "@/lib/domain/connections/types";
import {
  InvalidMessageError,
  MessageNotFoundError,
  MessagingForbiddenError,
  ThreadNotFoundError,
  type DmMessageDTO,
  type ThreadDTO,
  type ThreadListItemDTO,
  type ThreadMessagesResult,
} from "./types";

export const DM_THREAD_SUBJECT = "dmThread";

/** Recipient counts as "actively viewing" within this window. */
const ACTIVE_VIEWING_WINDOW_MS = 10_000;
const MAX_MESSAGE_LENGTH = 4_000;
const PREVIEW_LENGTH = 140;

function pairKeyFor(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

interface MessageRow {
  id: string;
  threadId: string;
  senderId: string | null;
  body: string;
  createdAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
  sender: { username: string } | null;
}

function toMessageDTO(row: MessageRow): DmMessageDTO {
  return {
    id: row.id,
    threadId: row.threadId,
    senderId: row.senderId,
    senderUsername: row.sender?.username ?? null,
    body: row.deletedAt ? "" : row.body,
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt ? row.editedAt.toISOString() : null,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
  };
}

async function requireParticipant(userId: string, threadId: string) {
  const participant = await prisma.dmParticipant.findUnique({
    where: { threadId_userId: { threadId, userId } },
  });
  if (!participant || participant.deletedAt) throw new ThreadNotFoundError();
  return participant;
}

export async function getOrCreateThread(
  userId: string,
  otherUserId: string,
): Promise<ThreadDTO> {
  if (otherUserId === userId) throw new MessagingForbiddenError();

  const [connected, blocked, otherUser] = await Promise.all([
    areConnected(prisma, userId, otherUserId),
    isBlockedEitherWay(prisma, userId, otherUserId),
    prisma.user.findUnique({
      where: { id: otherUserId },
      select: { id: true, username: true },
    }),
  ]);
  if (!otherUser || !connected || blocked) throw new MessagingForbiddenError();

  const pairKey = pairKeyFor(userId, otherUserId);
  const existing = await prisma.dmThread.findUnique({ where: { pairKey } });

  if (existing) {
    // Re-opening un-hides the thread for the caller if they had deleted it.
    await prisma.dmParticipant.update({
      where: { threadId_userId: { threadId: existing.id, userId } },
      data: { deletedAt: null },
    });
    return {
      id: existing.id,
      otherUser: { id: otherUser.id, username: otherUser.username },
      createdAt: existing.createdAt.toISOString(),
    };
  }

  const thread = await prisma.dmThread.create({
    data: {
      pairKey,
      participants: {
        create: [{ userId }, { userId: otherUserId }],
      },
    },
  });
  return {
    id: thread.id,
    otherUser: { id: otherUser.id, username: otherUser.username },
    createdAt: thread.createdAt.toISOString(),
  };
}

export async function listThreads(userId: string): Promise<ThreadListItemDTO[]> {
  const participations = await prisma.dmParticipant.findMany({
    where: { userId, deletedAt: null },
    include: {
      thread: {
        include: {
          participants: {
            where: { userId: { not: userId } },
            include: { user: { select: { id: true, username: true } } },
          },
          messages: {
            where: { deletedAt: null },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { body: true },
          },
        },
      },
    },
  });

  const items = await Promise.all(
    participations.map(async (participation) => {
      const thread = participation.thread;
      const other = thread.participants[0]?.user;
      const unreadCount = await prisma.dmMessage.count({
        where: {
          threadId: thread.id,
          deletedAt: null,
          senderId: { not: userId },
          ...(participation.lastReadAt
            ? { createdAt: { gt: participation.lastReadAt } }
            : {}),
        },
      });
      return {
        id: thread.id,
        otherUser: other
          ? { id: other.id, username: other.username }
          : { id: "", username: "Deleted user" },
        lastMessageAt: thread.lastMessageAt
          ? thread.lastMessageAt.toISOString()
          : null,
        lastMessagePreview:
          thread.messages[0]?.body.slice(0, PREVIEW_LENGTH) ?? null,
        unreadCount,
      };
    }),
  );

  return items.sort((a, b) =>
    (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""),
  );
}

export async function getThreadMessages(
  userId: string,
  threadId: string,
  opts: { cursor?: string; after?: string; limit?: number } = {},
): Promise<ThreadMessagesResult> {
  await requireParticipant(userId, threadId);
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);

  if (opts.after) {
    // Fast-poll delta: only messages newer than the client's watermark.
    const rows = await prisma.dmMessage.findMany({
      where: { threadId, createdAt: { gt: new Date(opts.after) } },
      orderBy: { createdAt: "asc" },
      take: limit,
      include: { sender: { select: { username: true } } },
    });
    return { messages: rows.map(toMessageDTO), nextCursor: null };
  }

  // History pagination: newest-first fetch, reversed for display order.
  const rows = await prisma.dmMessage.findMany({
    where: { threadId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    include: { sender: { select: { username: true } } },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    messages: page.map(toMessageDTO).reverse(),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}

export async function sendMessage(
  userId: string,
  threadId: string,
  body: string,
): Promise<DmMessageDTO> {
  const trimmed = body.trim();
  if (!trimmed || trimmed.length > MAX_MESSAGE_LENGTH) {
    throw new InvalidMessageError(
      `Message must be 1-${MAX_MESSAGE_LENGTH} characters`,
    );
  }

  await requireParticipant(userId, threadId);

  const others = await prisma.dmParticipant.findMany({
    where: { threadId, userId: { not: userId } },
    select: { userId: true, lastActiveAt: true },
  });
  const recipient = others[0];
  if (!recipient) throw new ThreadNotFoundError();

  // Guards re-checked at send time: disconnecting or blocking mid-thread
  // stops messages immediately.
  const [connected, blocked] = await Promise.all([
    areConnected(prisma, userId, recipient.userId),
    isBlockedEitherWay(prisma, userId, recipient.userId),
  ]);
  if (!connected || blocked) throw new MessagingForbiddenError();

  const rate = await consumeRateLimit({
    key: `dm:${userId}`,
    ...RATE_LIMITS.DM_MESSAGES_PER_HOUR,
  });
  if (!rate.ok) throw new RateLimitExceededError(rate.retryAfterSeconds);

  const sender = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true },
  });
  if (!sender) throw new Error("Unauthorized");

  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.dmMessage.create({
      data: { threadId, senderId: userId, body: trimmed },
      include: { sender: { select: { username: true } } },
    });

    await tx.dmThread.update({
      where: { id: threadId },
      data: { lastMessageAt: created.createdAt },
    });

    // A new message un-hides the thread for a recipient who deleted it.
    await tx.dmParticipant.update({
      where: { threadId_userId: { threadId, userId: recipient.userId } },
      data: { deletedAt: null },
    });

    const recipientIsViewing =
      recipient.lastActiveAt !== null &&
      Date.now() - recipient.lastActiveAt.getTime() < ACTIVE_VIEWING_WINDOW_MS;

    if (!recipientIsViewing) {
      await publishEvent(tx, {
        kind: "dm.message",
        actorType: "user",
        actorUserId: userId,
        payload: {
          threadId,
          messageId: created.id,
          senderUsername: sender.username,
          preview: trimmed.slice(0, PREVIEW_LENGTH),
        },
        subjectType: DM_THREAD_SUBJECT,
        subjectId: threadId,
        recipients: [
          { userId: recipient.userId, collapseKey: `dm:${threadId}` },
        ],
      });
    }

    return created;
  });

  return toMessageDTO(message);
}

export async function markThreadRead(
  userId: string,
  threadId: string,
): Promise<void> {
  await requireParticipant(userId, threadId);
  await prisma.dmParticipant.update({
    where: { threadId_userId: { threadId, userId } },
    data: { lastReadAt: new Date() },
  });
  await markSubjectRead(prisma, userId, DM_THREAD_SUBJECT, threadId);
}

/** Heartbeat from the fast poll — marks the viewer "actively viewing". */
export async function touchThreadActivity(
  userId: string,
  threadId: string,
): Promise<void> {
  await prisma.dmParticipant.updateMany({
    where: { threadId, userId, deletedAt: null },
    data: { lastActiveAt: new Date() },
  });
}

export async function deleteMessage(
  userId: string,
  threadId: string,
  messageId: string,
): Promise<void> {
  const result = await prisma.dmMessage.updateMany({
    where: { id: messageId, threadId, senderId: userId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (result.count === 0) throw new MessageNotFoundError();
}

export async function deleteThreadForUser(
  userId: string,
  threadId: string,
): Promise<void> {
  await requireParticipant(userId, threadId);
  await prisma.$transaction(async (tx) => {
    await tx.dmParticipant.update({
      where: { threadId_userId: { threadId, userId } },
      data: { deletedAt: new Date() },
    });
    await archiveSubject(tx, userId, DM_THREAD_SUBJECT, threadId);
  });
}
