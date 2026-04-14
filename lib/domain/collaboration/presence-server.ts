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

const STALE_AFTER_MS = 45_000;

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
  await prisma.collaborationPresence.deleteMany({
    where: {
      contentId,
      lastSeenAt: {
        lt: new Date(Date.now() - STALE_AFTER_MS),
      },
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
      lastSeenAt: {
        gte: new Date(Date.now() - STALE_AFTER_MS),
      },
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
