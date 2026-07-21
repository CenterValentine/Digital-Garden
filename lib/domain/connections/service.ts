/**
 * Connections domain service.
 *
 * Mutual-consent user connections built for enumeration safety:
 * - sendInvite ALWAYS reports success and always creates an invite row, so
 *   the sender's view is byte-identical whether the identifier resolved to
 *   a real account, themselves, an existing connection, or a blocker.
 * - When the invite must not reach anyone, `inviteeUserId` stays null — the
 *   suppressed invite can never be listed or accepted by the target.
 * - Declined invites keep rendering as "pending" to the sender until the
 *   14-day expiry sweep flips them to expired.
 */

import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/database/client";
import type { Prisma, PrismaClient } from "@/lib/database/generated/prisma";
import { AUDIT_ACTIONS } from "@/lib/domain/admin/api-types";
import { logAuditAction } from "@/lib/domain/admin/audit";
import {
  archiveSubject,
  markSubjectRead,
  publishEvent,
} from "@/lib/domain/notifications";
import {
  consumeRateLimit,
  RATE_LIMITS,
} from "@/lib/infrastructure/rate-limiting";
import {
  ConnectionInviteNotFoundError,
  ConnectionNotFoundError,
  InvalidConnectionActionError,
  RateLimitExceededError,
  type BlockDTO,
  type ConnectionDTO,
  type InviteListResult,
  type ReceivedInviteDTO,
  type SentInviteDTO,
} from "./types";

type ConnectionsPrismaClient = PrismaClient | Prisma.TransactionClient;

const INVITE_EXPIRY_DAYS = 14;
export const CONNECTION_INVITE_SUBJECT = "connectionInvite";

/** Canonical pair ordering — userAId is always the lexically smaller id. */
function canonicalPair(a: string, b: string): { userAId: string; userBId: string } {
  return a < b ? { userAId: a, userBId: b } : { userAId: b, userBId: a };
}

function identifierHash(identifier: string): string {
  return createHash("sha256").update(identifier).digest("hex").slice(0, 16);
}

export async function areConnected(
  db: ConnectionsPrismaClient,
  a: string,
  b: string,
): Promise<boolean> {
  const pair = canonicalPair(a, b);
  const row = await db.userConnection.findFirst({
    where: { ...pair, deletedAt: null },
    select: { id: true },
  });
  return row !== null;
}

export async function isBlockedEitherWay(
  db: ConnectionsPrismaClient,
  a: string,
  b: string,
): Promise<boolean> {
  const row = await db.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: a, blockedUserId: b },
        { blockerId: b, blockedUserId: a },
      ],
    },
    select: { id: true },
  });
  return row !== null;
}

/**
 * Send a connection invite by exact email or username.
 *
 * Always resolves to `{ status: "sent" }` unless the caller is rate limited —
 * every other outcome is indistinguishable to the sender by design.
 */
export async function sendInvite(
  userId: string,
  rawIdentifier: string,
  message: string | undefined,
  request: NextRequest,
): Promise<{ status: "sent" }> {
  const hourly = await consumeRateLimit({
    key: `invite-hour:${userId}`,
    ...RATE_LIMITS.CONNECTION_INVITES_PER_HOUR,
  });
  if (!hourly.ok) throw new RateLimitExceededError(hourly.retryAfterSeconds);
  const daily = await consumeRateLimit({
    key: `invite-day:${userId}`,
    ...RATE_LIMITS.CONNECTION_INVITES_PER_DAY,
  });
  if (!daily.ok) throw new RateLimitExceededError(daily.retryAfterSeconds);

  const identifier = rawIdentifier.trim().toLowerCase();
  const trimmedMessage = message?.trim() || undefined;

  const inviter = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true },
  });
  if (!inviter) throw new Error("Unauthorized");

  const target = await prisma.user.findFirst({
    where: {
      OR: [
        { email: { equals: identifier, mode: "insensitive" } },
        { username: { equals: identifier, mode: "insensitive" } },
      ],
    },
    select: { id: true },
  });

  // Decide whether the invite may actually reach anyone. All suppression
  // reasons leave the sender's response and sent-list identical.
  let suppressed = target === null;
  if (target && target.id === userId) suppressed = true;
  if (target && !suppressed) {
    if (await isBlockedEitherWay(prisma, userId, target.id)) suppressed = true;
    else if (await areConnected(prisma, userId, target.id)) suppressed = true;
    else {
      const duplicate = await prisma.connectionInvite.findFirst({
        where: {
          inviterId: userId,
          inviteeUserId: target.id,
          status: "pending",
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      });
      if (duplicate) suppressed = true;
    }
  }

  const expiresAt = new Date(
    Date.now() + INVITE_EXPIRY_DAYS * 86_400_000,
  );

  await prisma.$transaction(async (tx) => {
    const invite = await tx.connectionInvite.create({
      data: {
        inviterId: userId,
        inviteeIdentifier: identifier,
        inviteeUserId: suppressed ? null : target?.id ?? null,
        message: trimmedMessage ?? null,
        expiresAt,
      },
    });

    if (!suppressed && target) {
      await publishEvent(tx, {
        kind: "connection.invite",
        actorType: "user",
        actorUserId: userId,
        payload: {
          inviteId: invite.id,
          inviterUsername: inviter.username,
          ...(trimmedMessage ? { message: trimmedMessage } : {}),
        },
        subjectType: CONNECTION_INVITE_SUBJECT,
        subjectId: invite.id,
        recipients: [{ userId: target.id }],
      });
    }
  });

  await logAuditAction(
    userId,
    AUDIT_ACTIONS.CONNECTION_INVITE_SENT,
    { identifierHash: identifierHash(identifier) },
    request,
  );

  return { status: "sent" };
}

export async function respondToInvite(
  userId: string,
  inviteId: string,
  action: "accept" | "decline",
  request: NextRequest,
): Promise<{ status: "accepted" | "declined"; connectionId?: string }> {
  const invite = await prisma.connectionInvite.findFirst({
    where: {
      id: inviteId,
      inviteeUserId: userId,
      status: "pending",
      expiresAt: { gt: new Date() },
    },
    select: { id: true, inviterId: true },
  });
  if (!invite) throw new ConnectionInviteNotFoundError();

  if (action === "decline") {
    await prisma.$transaction(async (tx) => {
      await tx.connectionInvite.update({
        where: { id: invite.id },
        data: { status: "declined", respondedAt: new Date() },
      });
      // The invitee acted on it — clear it from their inbox. No event is
      // emitted: the inviter must never learn about the decline.
      await archiveSubject(tx, userId, CONNECTION_INVITE_SUBJECT, invite.id);
    });
    await logAuditAction(
      userId,
      AUDIT_ACTIONS.CONNECTION_INVITE_DECLINED,
      { inviteId: invite.id },
      request,
    );
    return { status: "declined" };
  }

  const accepter = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true },
  });
  if (!accepter) throw new Error("Unauthorized");

  const pair = canonicalPair(invite.inviterId, userId);
  const connectionId = await prisma.$transaction(async (tx) => {
    await tx.connectionInvite.update({
      where: { id: invite.id },
      data: { status: "accepted", respondedAt: new Date() },
    });

    const existing = await tx.userConnection.findUnique({
      where: { userAId_userBId: pair },
      select: { id: true },
    });
    const connection = existing
      ? await tx.userConnection.update({
          where: { id: existing.id },
          data: { deletedAt: null, deletedById: null, connectedAt: new Date() },
        })
      : await tx.userConnection.create({ data: pair });

    await publishEvent(tx, {
      kind: "connection.accepted",
      actorType: "user",
      actorUserId: userId,
      payload: {
        connectionId: connection.id,
        accepterUsername: accepter.username,
      },
      subjectType: "userConnection",
      subjectId: connection.id,
      recipients: [{ userId: invite.inviterId }],
    });

    await markSubjectRead(tx, userId, CONNECTION_INVITE_SUBJECT, invite.id);
    return connection.id;
  });

  await logAuditAction(
    userId,
    AUDIT_ACTIONS.CONNECTION_INVITE_ACCEPTED,
    { inviteId: invite.id, targetUserId: invite.inviterId },
    request,
  );

  return { status: "accepted", connectionId };
}

export async function revokeInvite(
  userId: string,
  inviteId: string,
  request: NextRequest,
): Promise<void> {
  const invite = await prisma.connectionInvite.findFirst({
    where: { id: inviteId, inviterId: userId, status: "pending" },
    select: { id: true, inviteeUserId: true },
  });
  if (!invite) throw new ConnectionInviteNotFoundError();

  await prisma.$transaction(async (tx) => {
    await tx.connectionInvite.update({
      where: { id: invite.id },
      data: { status: "revoked", respondedAt: new Date() },
    });
    if (invite.inviteeUserId) {
      await archiveSubject(
        tx,
        invite.inviteeUserId,
        CONNECTION_INVITE_SUBJECT,
        invite.id,
      );
    }
  });

  await logAuditAction(
    userId,
    AUDIT_ACTIONS.CONNECTION_INVITE_REVOKED,
    { inviteId: invite.id },
    request,
  );
}

export async function listInvites(userId: string): Promise<InviteListResult> {
  const now = new Date();
  const [sentRows, receivedRows] = await Promise.all([
    prisma.connectionInvite.findMany({
      // Declined invites keep showing as pending (decline privacy); expiry
      // is the only visible terminal state on the sender side.
      where: {
        inviterId: userId,
        status: { in: ["pending", "declined"] },
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        inviteeIdentifier: true,
        message: true,
        createdAt: true,
        expiresAt: true,
      },
    }),
    prisma.connectionInvite.findMany({
      where: {
        inviteeUserId: userId,
        status: "pending",
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        inviterId: true,
        message: true,
        createdAt: true,
        expiresAt: true,
        inviter: { select: { username: true } },
      },
    }),
  ]);

  const sent: SentInviteDTO[] = sentRows.map((row) => ({
    id: row.id,
    identifier: row.inviteeIdentifier,
    message: row.message,
    displayStatus: "pending",
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  }));

  const received: ReceivedInviteDTO[] = receivedRows.map((row) => ({
    id: row.id,
    inviterUserId: row.inviterId,
    inviterUsername: row.inviter.username,
    message: row.message,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  }));

  return { sent, received };
}

export async function listConnections(userId: string): Promise<ConnectionDTO[]> {
  const rows = await prisma.userConnection.findMany({
    where: {
      deletedAt: null,
      OR: [{ userAId: userId }, { userBId: userId }],
    },
    orderBy: { connectedAt: "desc" },
    include: {
      userA: { select: { id: true, username: true } },
      userB: { select: { id: true, username: true } },
    },
  });

  return rows.map((row) => {
    const other = row.userAId === userId ? row.userB : row.userA;
    return {
      id: row.id,
      userId: other.id,
      username: other.username,
      connectedAt: row.connectedAt.toISOString(),
    };
  });
}

export async function removeConnection(
  userId: string,
  connectionId: string,
  request: NextRequest,
): Promise<void> {
  const connection = await prisma.userConnection.findFirst({
    where: {
      id: connectionId,
      deletedAt: null,
      OR: [{ userAId: userId }, { userBId: userId }],
    },
    select: { id: true, userAId: true, userBId: true },
  });
  if (!connection) throw new ConnectionNotFoundError();

  // Silent removal — the other party is not notified (industry standard).
  await prisma.userConnection.update({
    where: { id: connection.id },
    data: { deletedAt: new Date(), deletedById: userId },
  });

  await logAuditAction(
    userId,
    AUDIT_ACTIONS.CONNECTION_REMOVED,
    {
      connectionId: connection.id,
      targetUserId:
        connection.userAId === userId ? connection.userBId : connection.userAId,
    },
    request,
  );
}

export async function blockUser(
  userId: string,
  targetUserId: string,
  request: NextRequest,
): Promise<BlockDTO> {
  if (targetUserId === userId) {
    throw new InvalidConnectionActionError("You cannot block yourself");
  }
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, username: true },
  });
  if (!target) throw new InvalidConnectionActionError("User not found");

  const pair = canonicalPair(userId, targetUserId);
  const block = await prisma.$transaction(async (tx) => {
    const created = await tx.userBlock.upsert({
      where: {
        blockerId_blockedUserId: { blockerId: userId, blockedUserId: targetUserId },
      },
      update: {},
      create: { blockerId: userId, blockedUserId: targetUserId },
    });

    await tx.userConnection.updateMany({
      where: { ...pair, deletedAt: null },
      data: { deletedAt: new Date(), deletedById: userId },
    });

    // Quietly kill pending invites in both directions — neither side is told.
    await tx.connectionInvite.updateMany({
      where: {
        status: "pending",
        OR: [
          { inviterId: userId, inviteeUserId: targetUserId },
          { inviterId: targetUserId, inviteeUserId: userId },
        ],
      },
      data: { status: "declined", respondedAt: new Date() },
    });

    // Clear anything the blocked user put in my inbox.
    await tx.notificationRecipient.updateMany({
      where: {
        userId,
        archivedAt: null,
        event: { actorUserId: targetUserId },
      },
      data: { archivedAt: new Date(), readAt: new Date() },
    });

    return created;
  });

  await logAuditAction(
    userId,
    AUDIT_ACTIONS.USER_BLOCKED,
    { targetUserId },
    request,
  );

  return {
    id: block.id,
    userId: target.id,
    username: target.username,
    createdAt: block.createdAt.toISOString(),
  };
}

export async function unblockUser(
  userId: string,
  blockId: string,
  request: NextRequest,
): Promise<void> {
  const result = await prisma.userBlock.deleteMany({
    where: { id: blockId, blockerId: userId },
  });
  if (result.count === 0) throw new ConnectionNotFoundError();

  await logAuditAction(
    userId,
    AUDIT_ACTIONS.USER_UNBLOCKED,
    { blockId },
    request,
  );
}

export async function listBlocks(userId: string): Promise<BlockDTO[]> {
  const rows = await prisma.userBlock.findMany({
    where: { blockerId: userId },
    orderBy: { createdAt: "desc" },
    include: { blocked: { select: { id: true, username: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    userId: row.blocked.id,
    username: row.blocked.username,
    createdAt: row.createdAt.toISOString(),
  }));
}
