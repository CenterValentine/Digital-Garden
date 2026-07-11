/**
 * NotificationTransport — delivery abstraction for the inbox.
 *
 * v1 is adaptive polling: a slow badge poll (45s + refresh on window focus)
 * plus a fast delta poll (2.5s) scoped to each open DM thread so replies
 * feel instant. Callers depend only on the interface; a future SSE or
 * pub/sub transport replaces createPollingTransport() without touching
 * consumers. Deliberately NOT piggybacked on the Hocuspocus socket — the
 * inbox must not inherit collaboration's degradable availability states.
 */

import type { DmMessageDTO } from "@/lib/domain/messaging/types";

export type TransportScope =
  | { kind: "badge" }
  | { kind: "thread"; threadId: string };

export type TransportEvent =
  | {
      type: "badge";
      unreadCount: number;
      latestCreatedAt: string | null;
      hasNew: boolean;
    }
  | { type: "thread-messages"; threadId: string; messages: DmMessageDTO[] };

export interface NotificationTransport {
  start(): void;
  stop(): void;
  /** Register a polling scope; returns a release function. */
  addScope(scope: TransportScope): () => void;
  subscribe(callback: (event: TransportEvent) => void): () => void;
  /** Immediate refresh of every active scope (window focus, after mutations). */
  refreshNow(): Promise<void>;
}

const BADGE_INTERVAL_MS = 45_000;
const THREAD_INTERVAL_MS = 2_500;

let sharedTransport: NotificationTransport | null = null;

/**
 * Browser-wide singleton. The provider component starts/stops it; any
 * component (bell popover, DM thread view) can add scopes or force a
 * refresh without threading React context through unrelated trees.
 */
export function getSharedNotificationTransport(): NotificationTransport {
  if (!sharedTransport) sharedTransport = createPollingTransport();
  return sharedTransport;
}

interface ThreadScopeState {
  refCount: number;
  timer: ReturnType<typeof setInterval> | null;
  /** ISO watermark — only messages newer than this are fetched. */
  lastSeen: string;
  polling: boolean;
}

export function createPollingTransport(): NotificationTransport {
  const listeners = new Set<(event: TransportEvent) => void>();
  const threadScopes = new Map<string, ThreadScopeState>();

  let badgeRefCount = 0;
  let badgeTimer: ReturnType<typeof setInterval> | null = null;
  let badgeSince: string | null = null;
  let badgePolling = false;
  let started = false;

  function emit(event: TransportEvent) {
    for (const listener of listeners) listener(event);
  }

  async function pollBadge(): Promise<void> {
    if (badgePolling) return;
    badgePolling = true;
    try {
      const params = badgeSince
        ? `?since=${encodeURIComponent(badgeSince)}`
        : "";
      const response = await fetch(`/api/notifications/poll${params}`, {
        credentials: "include",
      });
      if (!response.ok) return;
      const json = (await response.json()) as {
        success: boolean;
        data?: {
          unreadCount: number;
          latestCreatedAt: string | null;
          hasNew: boolean;
        };
      };
      if (!json.success || !json.data) return;
      badgeSince = json.data.latestCreatedAt ?? badgeSince;
      emit({ type: "badge", ...json.data });
    } catch {
      // Network blips are expected during polling; the next tick retries.
    } finally {
      badgePolling = false;
    }
  }

  async function pollThread(threadId: string): Promise<void> {
    const scope = threadScopes.get(threadId);
    if (!scope || scope.polling) return;
    scope.polling = true;
    try {
      const response = await fetch(
        `/api/messages/threads/${threadId}?after=${encodeURIComponent(scope.lastSeen)}&active=true`,
        { credentials: "include" },
      );
      if (!response.ok) return;
      const json = (await response.json()) as {
        success: boolean;
        data?: { messages: DmMessageDTO[] };
      };
      if (!json.success || !json.data) return;
      const messages = json.data.messages;
      if (messages.length > 0) {
        scope.lastSeen = messages[messages.length - 1].createdAt;
        emit({ type: "thread-messages", threadId, messages });
      }
    } catch {
      // Swallow — polling self-heals on the next tick.
    } finally {
      scope.polling = false;
    }
  }

  function ensureBadgeTimer() {
    if (started && badgeRefCount > 0 && !badgeTimer) {
      void pollBadge();
      badgeTimer = setInterval(() => void pollBadge(), BADGE_INTERVAL_MS);
    }
  }

  function ensureThreadTimer(threadId: string) {
    const scope = threadScopes.get(threadId);
    if (started && scope && !scope.timer) {
      void pollThread(threadId);
      scope.timer = setInterval(
        () => void pollThread(threadId),
        THREAD_INTERVAL_MS,
      );
    }
  }

  function handleFocus() {
    if (document.visibilityState === "visible") {
      void refreshNow();
    }
  }

  async function refreshNow(): Promise<void> {
    const tasks: Array<Promise<void>> = [];
    if (badgeRefCount > 0) tasks.push(pollBadge());
    for (const threadId of threadScopes.keys()) {
      tasks.push(pollThread(threadId));
    }
    await Promise.all(tasks);
  }

  return {
    start() {
      if (started) return;
      started = true;
      window.addEventListener("focus", handleFocus);
      document.addEventListener("visibilitychange", handleFocus);
      ensureBadgeTimer();
      for (const threadId of threadScopes.keys()) ensureThreadTimer(threadId);
    },

    stop() {
      started = false;
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
      if (badgeTimer) {
        clearInterval(badgeTimer);
        badgeTimer = null;
      }
      for (const scope of threadScopes.values()) {
        if (scope.timer) {
          clearInterval(scope.timer);
          scope.timer = null;
        }
      }
    },

    addScope(scope: TransportScope) {
      if (scope.kind === "badge") {
        badgeRefCount += 1;
        ensureBadgeTimer();
        return () => {
          badgeRefCount = Math.max(0, badgeRefCount - 1);
          if (badgeRefCount === 0 && badgeTimer) {
            clearInterval(badgeTimer);
            badgeTimer = null;
          }
        };
      }

      const { threadId } = scope;
      const existing = threadScopes.get(threadId);
      if (existing) {
        existing.refCount += 1;
      } else {
        threadScopes.set(threadId, {
          refCount: 1,
          timer: null,
          lastSeen: new Date().toISOString(),
          polling: false,
        });
        ensureThreadTimer(threadId);
      }
      return () => {
        const state = threadScopes.get(threadId);
        if (!state) return;
        state.refCount -= 1;
        if (state.refCount <= 0) {
          if (state.timer) clearInterval(state.timer);
          threadScopes.delete(threadId);
        }
      };
    },

    subscribe(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },

    refreshNow,
  };
}
