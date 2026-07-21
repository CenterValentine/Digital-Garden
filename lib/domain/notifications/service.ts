/**
 * Notifications domain service.
 *
 * ActivityEvent is the canonical, append-only record of what happened.
 * NotificationRecipient rows are the per-user projection carrying read /
 * archive state. All functions take a Prisma client (or transaction client)
 * as their first argument so event emission can join the emitting feature's
 * transaction — the same pattern as lib/domain/people/service.ts.
 */

import type { Prisma, PrismaClient } from "@/lib/database/generated/prisma";
import {
  NOTIFICATION_KINDS,
  isKnownNotificationKind,
  type NotificationKind,
} from "./kinds";
import type {
  ActivityActorTypeValue,
  NotificationDTO,
  NotificationListFilter,
  NotificationListResult,
  UnreadSummary,
} from "./types";

export type NotificationsPrismaClient = PrismaClient | Prisma.TransactionClient;

/** Retention windows enforced by runMaintenance (days). */
export const NOTIFICATION_RETENTION = {
  archivedRecipientDays: 90,
  eventDays: 365,
  inviteExpiryDays: 14,
} as const;

export interface PublishEventInput {
  kind: NotificationKind | (string & {});
  actorType: ActivityActorTypeValue;
  actorUserId?: string;
  actorLabel?: string;
  payload: Record<string, unknown>;
  subjectType?: string;
  subjectId?: string;
  recipients: Array<{ userId: string; collapseKey?: string }>;
}

interface RecipientPreferences {
  kinds: Record<string, boolean>;
  aiNotificationsEnabled: boolean;
}

function readNotificationPreferences(settings: unknown): RecipientPreferences {
  const defaults: RecipientPreferences = {
    kinds: {},
    aiNotificationsEnabled: true,
  };
  if (typeof settings !== "object" || settings === null) return defaults;
  const section = (settings as Record<string, unknown>).notifications;
  if (typeof section !== "object" || section === null) return defaults;
  const raw = section as Record<string, unknown>;
  const kinds: Record<string, boolean> = {};
  if (typeof raw.kinds === "object" && raw.kinds !== null) {
    for (const [key, value] of Object.entries(
      raw.kinds as Record<string, unknown>,
    )) {
      if (typeof value === "boolean") kinds[key] = value;
    }
  }
  return {
    kinds,
    aiNotificationsEnabled: raw.aiNotificationsEnabled !== false,
  };
}

/**
 * Validate the payload against the kind registry, create the canonical
 * ActivityEvent, then project NotificationRecipient rows — honoring each
 * recipient's per-kind preferences and coalescing collapsible kinds.
 */
export async function publishEvent(
  db: NotificationsPrismaClient,
  input: PublishEventInput,
): Promise<{ eventId: string }> {
  if (!isKnownNotificationKind(input.kind)) {
    throw new Error(`Unknown notification kind: ${input.kind}`);
  }
  const definition = NOTIFICATION_KINDS[input.kind];
  const payload = definition.payloadSchema.parse(
    input.payload,
  ) as Prisma.InputJsonObject;

  const event = await db.activityEvent.create({
    data: {
      kind: input.kind,
      actorType: input.actorType,
      actorUserId: input.actorUserId ?? null,
      actorLabel: input.actorLabel ?? null,
      payload,
      subjectType: input.subjectType ?? null,
      subjectId: input.subjectId ?? null,
    },
  });

  // Never notify the acting user about their own action.
  const recipientList = input.recipients.filter(
    (recipient) => recipient.userId !== input.actorUserId,
  );
  if (recipientList.length === 0) return { eventId: event.id };

  const users = await db.user.findMany({
    where: { id: { in: recipientList.map((r) => r.userId) } },
    select: { id: true, settings: true },
  });
  const settingsByUser = new Map(users.map((u) => [u.id, u.settings]));

  for (const recipient of recipientList) {
    // Unknown user ids are silently skipped (e.g. deleted mid-flight).
    if (!settingsByUser.has(recipient.userId)) continue;

    const prefs = readNotificationPreferences(
      settingsByUser.get(recipient.userId),
    );
    if (prefs.kinds[input.kind] === false) continue;
    if (input.actorType === "ai" && !prefs.aiNotificationsEnabled) continue;

    if (definition.collapsible && recipient.collapseKey) {
      const existing = await db.notificationRecipient.findFirst({
        where: {
          userId: recipient.userId,
          collapseKey: recipient.collapseKey,
          readAt: null,
          archivedAt: null,
        },
        select: { id: true },
      });
      if (existing) {
        // Re-point the unread row at the newest event and bump it to the top.
        await db.notificationRecipient.update({
          where: { id: existing.id },
          data: { eventId: event.id, createdAt: new Date() },
        });
        continue;
      }
    }

    await db.notificationRecipient.create({
      data: {
        eventId: event.id,
        userId: recipient.userId,
        collapseKey: recipient.collapseKey ?? null,
      },
    });
  }

  return { eventId: event.id };
}

/** Cheap badge poll: unread count + newest projection timestamp. */
export async function getUnreadSummary(
  db: NotificationsPrismaClient,
  userId: string,
): Promise<UnreadSummary> {
  const [unreadCount, latest] = await Promise.all([
    db.notificationRecipient.count({
      where: { userId, readAt: null, archivedAt: null },
    }),
    db.notificationRecipient.findFirst({
      where: { userId, archivedAt: null },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);
  return {
    unreadCount,
    latestCreatedAt: latest ? latest.createdAt.toISOString() : null,
  };
}

type RecipientWithEvent = Prisma.NotificationRecipientGetPayload<{
  include: { event: { include: { actor: { select: { username: true } } } } };
}>;

function toNotificationDTO(row: RecipientWithEvent): NotificationDTO {
  return {
    id: row.id,
    kind: row.event.kind,
    payload: (row.event.payload ?? {}) as Record<string, unknown>,
    actor: {
      type: row.event.actorType,
      userId: row.event.actorUserId ?? undefined,
      username: row.event.actor?.username,
      label: row.event.actorLabel ?? undefined,
    },
    subjectType: row.event.subjectType,
    subjectId: row.event.subjectId,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt ? row.readAt.toISOString() : null,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
  };
}

export async function listNotifications(
  db: NotificationsPrismaClient,
  userId: string,
  opts: {
    filter?: NotificationListFilter;
    cursor?: string;
    limit?: number;
  } = {},
): Promise<NotificationListResult> {
  const filter = opts.filter ?? "all";
  const limit = Math.min(Math.max(opts.limit ?? 15, 1), 50);

  const where: Prisma.NotificationRecipientWhereInput = { userId };
  if (filter === "unread") {
    where.readAt = null;
    where.archivedAt = null;
  } else if (filter === "archived") {
    where.archivedAt = { not: null };
  } else {
    where.archivedAt = null;
  }

  const rows = await db.notificationRecipient.findMany({
    where,
    include: {
      event: { include: { actor: { select: { username: true } } } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    items: page.map(toNotificationDTO),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}

export async function setReadState(
  db: NotificationsPrismaClient,
  userId: string,
  notificationId: string,
  read: boolean,
): Promise<boolean> {
  const result = await db.notificationRecipient.updateMany({
    where: { id: notificationId, userId },
    data: { readAt: read ? new Date() : null },
  });
  return result.count > 0;
}

export async function setArchived(
  db: NotificationsPrismaClient,
  userId: string,
  notificationId: string,
  archived: boolean,
): Promise<boolean> {
  const result = await db.notificationRecipient.updateMany({
    where: { id: notificationId, userId },
    data: {
      archivedAt: archived ? new Date() : null,
      // Archiving implies the item was seen.
      ...(archived ? { readAt: new Date() } : {}),
    },
  });
  return result.count > 0;
}

export async function markAllRead(
  db: NotificationsPrismaClient,
  userId: string,
): Promise<number> {
  const result = await db.notificationRecipient.updateMany({
    where: { userId, readAt: null, archivedAt: null },
    data: { readAt: new Date() },
  });
  return result.count;
}

/**
 * Mark every unread notification whose event targets the given subject.
 * Keeps the bell badge coherent with in-context reads (e.g. opening a DM
 * thread clears its "dm.message" notifications).
 */
export async function markSubjectRead(
  db: NotificationsPrismaClient,
  userId: string,
  subjectType: string,
  subjectId: string,
): Promise<number> {
  const result = await db.notificationRecipient.updateMany({
    where: {
      userId,
      readAt: null,
      event: { subjectType, subjectId },
    },
    data: { readAt: new Date() },
  });
  return result.count;
}

/** Archive a subject's notifications (e.g. a revoked invite disappears). */
export async function archiveSubject(
  db: NotificationsPrismaClient,
  userId: string,
  subjectType: string,
  subjectId: string,
): Promise<number> {
  const now = new Date();
  const result = await db.notificationRecipient.updateMany({
    where: {
      userId,
      archivedAt: null,
      event: { subjectType, subjectId },
    },
    data: { archivedAt: now, readAt: now },
  });
  return result.count;
}

export interface MaintenanceResult {
  expiredInvites: number;
  deletedArchivedRecipients: number;
  deletedEvents: number;
  deletedRateWindows: number;
}

/** Retention sweeps — invoked by the daily maintenance cron. */
export async function runMaintenance(
  db: NotificationsPrismaClient,
): Promise<MaintenanceResult> {
  const now = Date.now();
  const dayMs = 86_400_000;

  const expiredInvites = await db.connectionInvite.updateMany({
    where: { status: "pending", expiresAt: { lt: new Date(now) } },
    data: { status: "expired" },
  });

  const deletedArchivedRecipients = await db.notificationRecipient.deleteMany({
    where: {
      archivedAt: {
        lt: new Date(now - NOTIFICATION_RETENTION.archivedRecipientDays * dayMs),
      },
    },
  });

  // Cascades remaining recipient rows via the FK.
  const deletedEvents = await db.activityEvent.deleteMany({
    where: {
      createdAt: {
        lt: new Date(now - NOTIFICATION_RETENTION.eventDays * dayMs),
      },
    },
  });

  const deletedRateWindows = await db.rateLimitCounter.deleteMany({
    where: { windowStart: { lt: new Date(now - 2 * dayMs) } },
  });

  return {
    expiredInvites: expiredInvites.count,
    deletedArchivedRecipients: deletedArchivedRecipients.count,
    deletedEvents: deletedEvents.count,
    deletedRateWindows: deletedRateWindows.count,
  };
}
