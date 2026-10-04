import type { PrismaClient } from "@/lib/database/generated/prisma";

export interface CollaborationPresenceRecord {
  contentId: string;
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  isAnonymous: boolean;
  sessionId: string;
  browserContextId: string;
  surfaceCount: number;
  activePaneIds: string[];
  activeTabIds: string[];
  transportState:
    | "localOnly"
    | "promoting"
    | "connecting"
    | "connected"
    | "synced"
    | "disconnectedButDirty"
    | "coolingDown";
  lastKnownServerRevision: number | null;
  firstSeenAt: number;
  lastSeenAt: number;
}


// Two-tier staleness keyed off the record's transportState:
// - Active transports heartbeat every 10-30s → 45s window keeps crashed tabs
//   from leaving ghost badges for long.
// - Dormant transports (sleep mode) deliberately heartbeat every 5 min → an
//   8-minute window keeps their grey badge alive between beats. A hard-killed
//   dormant tab lingers as a grey badge for up to ~8 min; graceful closes are
//   cleared immediately by the surfaceCount=0 close beacon.
const STALE_AFTER_MS = 45_000;
const DORMANT_STALE_AFTER_MS = 8 * 60_000;
const DORMANT_TRANSPORT_STATES = [
  "localOnly",
  "coolingDown",
  "disconnectedButDirty",
] as const;

function freshnessFilter(now: number) {
  return {
    OR: [
      {
        transportState: { in: [...DORMANT_TRANSPORT_STATES] },
        lastSeenAt: { gte: new Date(now - DORMANT_STALE_AFTER_MS) },
      },
      {
        transportState: { notIn: [...DORMANT_TRANSPORT_STATES] },
        lastSeenAt: { gte: new Date(now - STALE_AFTER_MS) },
      },
    ],
  };
}


async function prune(prisma: PrismaClient, contentId: string) {
  const now = Date.now();
  await prisma.collaborationPresence.deleteMany({
    where: {
      contentId,
      NOT: freshnessFilter(now),
    },
  });
}

export async function upsertCollaborationPresence(
  prisma: PrismaClient,
  record: Omit<CollaborationPresenceRecord, "firstSeenAt" | "lastSeenAt">
) {
  const now = new Date();
  await prisma.collaborationPresence.upsert({
    where: {
      contentId_sessionId: {
        contentId: record.contentId,
        sessionId: record.sessionId,
      },
    },
    create: {
      contentId: record.contentId,
      userId: record.userId,
      displayName: record.displayName,
      avatarUrl: record.avatarUrl,
      isAnonymous: record.isAnonymous,
      sessionId: record.sessionId,
      browserContextId: record.browserContextId,
      surfaceCount: record.surfaceCount,
      activePaneIds: record.activePaneIds,
      activeTabIds: record.activeTabIds,
      transportState: record.transportState,
      lastKnownServerRevision: record.lastKnownServerRevision,
      firstSeenAt: now,
      lastSeenAt: now,
    },
    update: {
      userId: record.userId,
      displayName: record.displayName,
      avatarUrl: record.avatarUrl,
      isAnonymous: record.isAnonymous,
      browserContextId: record.browserContextId,
      surfaceCount: record.surfaceCount,
      activePaneIds: record.activePaneIds,
      activeTabIds: record.activeTabIds,
      transportState: record.transportState,
      lastKnownServerRevision: record.lastKnownServerRevision,
      lastSeenAt: now,
    },
  });
  await prune(prisma, record.contentId);
}

export async function listCollaborationPresence(prisma: PrismaClient, contentId: string) {
  const records = await prisma.collaborationPresence.findMany({
    where: {
      contentId,
      surfaceCount: {
        gt: 0,
      },
      ...freshnessFilter(Date.now()),
    },
    orderBy: {
      firstSeenAt: "asc",
    },
  });

  return records.map((record) => ({
    contentId: record.contentId,
    userId: record.userId,
    displayName: record.displayName,
    avatarUrl: record.avatarUrl,
    isAnonymous: record.isAnonymous,
    sessionId: record.sessionId,
    browserContextId: record.browserContextId,
    surfaceCount: record.surfaceCount,
    activePaneIds: record.activePaneIds,
    activeTabIds: record.activeTabIds,
    transportState: record.transportState as CollaborationPresenceRecord["transportState"],
    lastKnownServerRevision: record.lastKnownServerRevision,
    firstSeenAt: record.firstSeenAt.getTime(),
    lastSeenAt: record.lastSeenAt.getTime(),
  }));
}

