"use client";

/**
 * Shared presence poller for surfaces that need "is this content actively
 * open in another session?" without owning a collaboration runtime —
 * today: the Note Window block's edit gate.
 *
 * ONE module-level poller serves every subscriber: N windows across any
 * number of host editors collapse into ceil(uniqueIds/16) requests per
 * 10s tick (the batch route caps contentIds at 16 per request). Chosen
 * over SSE-per-contentId (one EventSource per id — the socket cost the
 * snapshot design explicitly avoids) and per-instance polling (N
 * requests). Subscribing triggers an immediate fetch for that id; a
 * window-focus listener refreshes everything.
 *
 * Presence is advisory: fetch failures keep the last known snapshot
 * (fail-open), matching the MainPanelHeader tab-presence convention.
 */

import { useCallback, useMemo, useSyncExternalStore } from "react";

import { getCollaborationBrowserSessionId } from "@/lib/domain/collaboration/runtime";

/**
 * Transport states that represent an actively-synced collaboration
 * connection. Anything else (localOnly, coolingDown, disconnectedButDirty)
 * is dormant — a dormant session elsewhere does NOT trip the edit gate;
 * if both sides later edit, the runtime's topology escalation promotes
 * both into real collaboration (convergence, not divergence).
 *
 * Same membership as MainPanelHeader's local copy — lifted here so gate
 * logic and presence discs can't drift. (The header keeps its copy for
 * now; re-pointing it is a cleanup, not a behavior change.)
 */
export const ACTIVE_TRANSPORT_STATES = new Set([
  "synced",
  "connected",
  "connecting",
  "promoting",
]);

export function isActiveTransport(transportState: string | undefined): boolean {
  return ACTIVE_TRANSPORT_STATES.has(transportState ?? "");
}

export interface PresenceRecord {
  sessionId: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  isAnonymous: boolean;
  surfaceCount: number;
  transportState: string;
  firstSeenAt: number;
  lastSeenAt: number;
}

const POLL_INTERVAL_MS = 10_000;
/** The presence batch route caps contentIds per request. */
const MAX_IDS_PER_REQUEST = 16;
const EMPTY: PresenceRecord[] = [];

function recordsEqual(a: PresenceRecord[], b: PresenceRecord[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (
      a[i].sessionId !== b[i].sessionId ||
      a[i].transportState !== b[i].transportState ||
      a[i].surfaceCount !== b[i].surfaceCount ||
      a[i].lastSeenAt !== b[i].lastSeenAt
    ) {
      return false;
    }
  }
  return true;
}

class PresencePoller {
  private subscribers = new Map<string, Set<() => void>>();
  private cache = new Map<string, PresenceRecord[]>();
  private intervalId: number | null = null;
  private readonly onFocus = () => {
    void this.fetchIds([...this.subscribers.keys()]);
  };

  subscribe(contentId: string, callback: () => void): () => void {
    let set = this.subscribers.get(contentId);
    if (!set) {
      set = new Set();
      this.subscribers.set(contentId, set);
    }
    set.add(callback);
    this.start();
    // Immediate fetch so a freshly-mounted gate doesn't wait a full tick.
    void this.fetchIds([contentId]);
    return () => {
      const current = this.subscribers.get(contentId);
      current?.delete(callback);
      if (current && current.size === 0) this.subscribers.delete(contentId);
      if (this.subscribers.size === 0) this.stop();
    };
  }

  getSnapshot(contentId: string): PresenceRecord[] {
    return this.cache.get(contentId) ?? EMPTY;
  }

  private start() {
    if (this.intervalId !== null || typeof window === "undefined") return;
    this.intervalId = window.setInterval(() => {
      void this.fetchIds([...this.subscribers.keys()]);
    }, POLL_INTERVAL_MS);
    window.addEventListener("focus", this.onFocus);
  }

  private stop() {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
    window.removeEventListener("focus", this.onFocus);
  }

  private async fetchIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const sessionId = getCollaborationBrowserSessionId();
    for (let i = 0; i < ids.length; i += MAX_IDS_PER_REQUEST) {
      const chunk = ids.slice(i, i + MAX_IDS_PER_REQUEST);
      try {
        const params = new URLSearchParams({
          contentIds: chunk.join(","),
          excludeSessionId: sessionId,
        });
        const res = await fetch(
          `/api/collaboration/presence?${params.toString()}`,
          { credentials: "include" },
        );
        if (!res.ok) continue; // advisory — keep last known snapshot
        const result = (await res.json()) as {
          success?: boolean;
          data?: { presenceByContentId?: Record<string, PresenceRecord[]> };
        };
        const byId = result.data?.presenceByContentId;
        if (!result.success || !byId) continue;
        for (const id of chunk) {
          const fresh = byId[id] ?? EMPTY;
          const prev = this.cache.get(id) ?? EMPTY;
          if (recordsEqual(prev, fresh)) continue;
          this.cache.set(id, fresh);
          const subs = this.subscribers.get(id);
          if (subs) for (const cb of subs) cb();
        }
      } catch {
        // advisory — fail open on the last known snapshot
      }
    }
  }
}

const presencePoller = new PresencePoller();

export interface ContentPresence {
  sessions: PresenceRecord[];
  /** True when any OTHER session has an actively-synced transport. */
  activeElsewhere: boolean;
  displayNames: string[];
}

/**
 * Presence of a content node in other sessions (this tab's own session is
 * excluded server-side via excludeSessionId — note sessionId is per-tab,
 * so another tab of this browser counts as "elsewhere", which is exactly
 * the Note Window gate's contract).
 */
export function useContentPresence(contentId: string | null): ContentPresence {
  const subscribe = useCallback(
    (callback: () => void) =>
      contentId ? presencePoller.subscribe(contentId, callback) : () => {},
    [contentId],
  );
  const getSnapshot = useCallback(
    () => (contentId ? presencePoller.getSnapshot(contentId) : EMPTY),
    [contentId],
  );
  const sessions = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);

  return useMemo(() => {
    const active = sessions.filter((s) => isActiveTransport(s.transportState));
    const names = [...new Set(active.map((s) => s.displayName).filter(Boolean))];
    return {
      sessions,
      activeElsewhere: active.length > 0,
      displayNames: names,
    };
  }, [sessions]);
}
