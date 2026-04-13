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
  records: Map<string, CollaborationPresenceRecord>;
  listeners: Map<string, Set<() => void>>;
}

const STALE_AFTER_MS = 45_000;

declare global {
  var __dgCollaborationPresenceStore: PresenceStore | undefined;
}

function getStore() {
  if (!globalThis.__dgCollaborationPresenceStore) {
    globalThis.__dgCollaborationPresenceStore = {
      records: new Map(),
      listeners: new Map(),
    };
  }
  return globalThis.__dgCollaborationPresenceStore;
}

function getKey(contentId: string, sessionId: string) {
  return `${contentId}:${sessionId}`;
}

function prune(contentId: string) {
  const store = getStore();
  const now = Date.now();
  for (const [key, record] of store.records) {
    if (record.contentId === contentId && now - record.lastSeenAt > STALE_AFTER_MS) {
      store.records.delete(key);
    }
  }
}

export function upsertCollaborationPresence(
  record: Omit<CollaborationPresenceRecord, "firstSeenAt" | "lastSeenAt">
) {
  const store = getStore();
  const existing = store.records.get(getKey(record.contentId, record.sessionId));
  store.records.set(getKey(record.contentId, record.sessionId), {
    ...record,
    firstSeenAt: existing?.firstSeenAt ?? Date.now(),
    lastSeenAt: Date.now(),
  });
  prune(record.contentId);
  notifyCollaborationPresence(record.contentId);
}

export function listCollaborationPresence(contentId: string) {
  const store = getStore();
  prune(contentId);
  return Array.from(store.records.values()).filter(
    (record) => record.contentId === contentId && record.surfaceCount > 0
  );
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
