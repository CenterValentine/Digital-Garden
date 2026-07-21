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

interface PresenceStore {
  listeners: Map<string, Set<() => void>>;
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

declare global {
  var __dgCollaborationPresenceStore: PresenceStore | undefined;
}

function getStore() {
  if (!globalThis.__dgCollaborationPresenceStore) {
    globalThis.__dgCollaborationPresenceStore = {
      listeners: new Map(),
    };
  }
  return globalThis.__dgCollaborationPresenceStore;
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
  notifyCollaborationPresence(record.contentId);
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

export function subscribeCollaborationPresence(contentId: string, listener: () => void) {
  const store = getStore();
  const listeners = store.listeners.get(contentId) ?? new Set<() => void>();
  listeners.add(listener);
  store.listeners.set(contentId, listeners);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      store.listeners.delete(contentId);
    }
  };
}

export function notifyCollaborationPresence(contentId: string) {
  const listeners = getStore().listeners.get(contentId);
  if (!listeners) return;
  for (const listener of listeners) {
    listener();
  }
}
