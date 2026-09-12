import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PaneHistoryState } from "./navigation-history-store";

/**
 * When each open content was last "touched" — the signal behind the clear-tabs
 * control's idle buckets ("close what I haven't been using").
 *
 * Two sources, merged at read time:
 *
 *  - ACTIVATION comes from `navigation-history-store`, which already stamps
 *    every pane navigation with a timestamp and persists it. Nothing new needs
 *    to record it, and it covers panes this component never watches.
 *  - FIRST SIGHTING is what this store adds. A tab restored with a workspace
 *    and never clicked has no activation entry at all, and treating "unknown"
 *    as "idle forever" would put every just-restored tab in the 1h bucket the
 *    moment the workspace opens. Stamping it when first seen means a restored
 *    tab starts its idle clock on arrival, which is what a user means by
 *    "I haven't touched that since I got here".
 *
 * Deliberately per-device and lossy: an idle bucket is a convenience for
 * pruning a crowded strip, not a record anything depends on. Entries are
 * pruned past RETENTION_MS so the persisted map can't grow without bound.
 */

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface TabActivityState {
  /** contentId → epoch ms when this surface first saw the tab open. */
  firstSeenAt: Record<string, number>;
  /** Stamp ids with no record yet; known ids keep their original stamp. */
  noteSeen: (contentIds: Iterable<string>) => void;
}

export const useTabActivityStore = create<TabActivityState>()(
  persist(
    (set) => ({
      firstSeenAt: {},
      noteSeen: (contentIds) =>
        set((state) => {
          const now = Date.now();
          const unseen = [...contentIds].filter(
            (contentId) => state.firstSeenAt[contentId] === undefined
          );
          const stale = Object.entries(state.firstSeenAt).filter(
            ([, at]) => now - at > RETENTION_MS
          );
          if (unseen.length === 0 && stale.length === 0) return state;

          const next = { ...state.firstSeenAt };
          for (const [contentId] of stale) delete next[contentId];
          for (const contentId of unseen) next[contentId] = now;
          return { firstSeenAt: next };
        }),
    }),
    {
      name: "notes:tab-activity",
      version: 1,
      partialize: (state) => ({ firstSeenAt: state.firstSeenAt }),
    }
  )
);

/**
 * Newest activation per contentId across every pane's navigation history.
 * A content id can appear in several panes' stacks; the most recent wins.
 */
export function buildActivationTimes(
  byPaneId: Record<string, PaneHistoryState>
): Map<string, number> {
  const activationAt = new Map<string, number>();
  for (const paneState of Object.values(byPaneId)) {
    for (const item of paneState.history) {
      if (!item.contentId) continue;
      const previous = activationAt.get(item.contentId);
      if (previous === undefined || item.timestamp > previous) {
        activationAt.set(item.contentId, item.timestamp);
      }
    }
  }
  return activationAt;
}

/**
 * Effective last-touched time, or null when this surface has no signal at all
 * (the caller decides what to do with an unknown — the clear-tabs menu leaves
 * such tabs out of every idle bucket rather than guessing them stale).
 */
export function resolveLastTouchedAt(
  contentId: string,
  firstSeenAt: Record<string, number>,
  activationAt: Map<string, number>
): number | null {
  const activated = activationAt.get(contentId);
  const seen = firstSeenAt[contentId];
  if (activated === undefined && seen === undefined) return null;
  return Math.max(activated ?? 0, seen ?? 0);
}
