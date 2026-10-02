/**
 * Navigation History Store
 *
 * Maintains independent back/forward stacks per pane so split layouts can add
 * local navigation without rewriting the API later.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { TOP_LEFT_PANE_ID, type WorkspacePaneId } from "./content-store";

const MAX_HISTORY_ITEMS = 100;
const CURRENT_VERSION = 3;

export interface NavigationHistoryItem {
  contentId: string | null;
  timestamp: number;
  title?: string;
  contentType?: string;
  /**
   * Where inside the content this step was — a `"<kind>:<id>"` anchor, the
   * same contract as wiki-link anchors (lib/domain/content/link-anchor.ts).
   * Viewers with their own views (the scripture reader: covers → volume →
   * book → chapter) record one per view, so Back walks those views too.
   */
  anchor?: string;
  /** The view's own name for the history list ("Alma 32"); `title` stays the content's. */
  label?: string;
}

export interface PaneHistoryState {
  history: NavigationHistoryItem[];
  currentIndex: number;
}

interface NavigationHistoryStore {
  byPaneId: Record<string, PaneHistoryState>;
  addToHistory: (contentId: string | null, paneId?: string | null, meta?: { title?: string; contentType?: string }) => void;
  /**
   * A viewer moved to a view inside `contentId`. The first view recorded for
   * the current entry names that entry's spot; each later, different view is
   * a new step. Ignored unless `contentId` is the pane's current entry.
   */
  recordLocation: (contentId: string, paneId: string | null | undefined, anchor: string, label?: string) => void;
  goBack: (paneId?: string | null) => NavigationHistoryItem | null;
  goForward: (paneId?: string | null) => NavigationHistoryItem | null;
  getPaneHistory: (paneId?: string | null) => PaneHistoryState;
  getBackHistory: (paneId?: string | null) => NavigationHistoryItem[];
  clearHistory: (paneId?: string | null) => void;
}

const EMPTY_PANE_HISTORY: PaneHistoryState = {
  history: [],
  currentIndex: -1,
};

function resolvePaneId(paneId?: string | null): WorkspacePaneId {
  return (paneId as WorkspacePaneId | null | undefined) ?? TOP_LEFT_PANE_ID;
}

function getPaneState(
  byPaneId: Record<string, PaneHistoryState>,
  paneId?: string | null
) {
  return byPaneId[resolvePaneId(paneId)] ?? EMPTY_PANE_HISTORY;
}

function sanitizePaneHistoryState(
  paneState: PaneHistoryState | undefined
): PaneHistoryState {
  if (!paneState) {
    return EMPTY_PANE_HISTORY;
  }

  const history = paneState.history.filter(
    (item): item is NavigationHistoryItem => Boolean(item.contentId)
  );

  if (history.length === 0) {
    return EMPTY_PANE_HISTORY;
  }

  return {
    history,
    currentIndex: Math.min(
      Math.max(paneState.currentIndex, 0),
      history.length - 1
    ),
  };
}

export const useNavigationHistoryStore = create<NavigationHistoryStore>()(
  persist(
    (set, get) => ({
      byPaneId: {},

      addToHistory: (contentId, paneId, meta) => {
        if (!contentId) {
          return;
        }

        const resolvedPaneId = resolvePaneId(paneId);
        set((state) => {
          const paneState = getPaneState(state.byPaneId, resolvedPaneId);
          const truncatedHistory = paneState.history.slice(
            0,
            paneState.currentIndex + 1
          );

          if (
            paneState.history.length > 0 &&
            paneState.currentIndex >= 0 &&
            paneState.history[paneState.currentIndex]?.contentId === contentId
          ) {
            const updatedHistory = [...paneState.history];
            updatedHistory[paneState.currentIndex] = {
              contentId,
              timestamp: Date.now(),
              title: meta?.title ?? paneState.history[paneState.currentIndex]?.title,
              contentType: meta?.contentType ?? paneState.history[paneState.currentIndex]?.contentType,
              anchor: paneState.history[paneState.currentIndex]?.anchor,
              label: paneState.history[paneState.currentIndex]?.label,
            };

            return {
              byPaneId: {
                ...state.byPaneId,
                [resolvedPaneId]: {
                  history: updatedHistory,
                  currentIndex: paneState.currentIndex,
                },
              },
            };
          }

          const deduplicated = truncatedHistory.filter(
            (item) => item.contentId !== contentId
          );
          const nextHistory = [
            ...deduplicated,
            { contentId, timestamp: Date.now(), title: meta?.title, contentType: meta?.contentType },
          ];
          const limitedHistory =
            nextHistory.length > MAX_HISTORY_ITEMS
              ? nextHistory.slice(nextHistory.length - MAX_HISTORY_ITEMS)
              : nextHistory;

          return {
            byPaneId: {
              ...state.byPaneId,
              [resolvedPaneId]: {
                history: limitedHistory,
                currentIndex: limitedHistory.length - 1,
              },
            },
          };
        });
      },

      recordLocation: (contentId, paneId, anchor, label) => {
        const resolvedPaneId = resolvePaneId(paneId);
        set((state) => {
          const paneState = getPaneState(state.byPaneId, resolvedPaneId);
          const current = paneState.history[paneState.currentIndex];
          if (!current || current.contentId !== contentId || current.anchor === anchor) return state;
          let history: NavigationHistoryItem[];
          let currentIndex: number;
          if (!current.anchor) {
            // The content's first view: it names where this entry already is.
            history = [...paneState.history];
            history[paneState.currentIndex] = { ...current, anchor, label };
            currentIndex = paneState.currentIndex;
          } else {
            const next: NavigationHistoryItem = {
              contentId,
              timestamp: Date.now(),
              title: current.title,
              contentType: current.contentType,
              anchor,
              label,
            };
            history = [...paneState.history.slice(0, paneState.currentIndex + 1), next];
            if (history.length > MAX_HISTORY_ITEMS) history = history.slice(history.length - MAX_HISTORY_ITEMS);
            currentIndex = history.length - 1;
          }
          return { byPaneId: { ...state.byPaneId, [resolvedPaneId]: { history, currentIndex } } };
        });
      },

      goBack: (paneId) => {
        const resolvedPaneId = resolvePaneId(paneId);
        const paneState = getPaneState(get().byPaneId, resolvedPaneId);
        if (paneState.currentIndex <= 0) return null;

        const newIndex = paneState.currentIndex - 1;
        set((state) => ({
          byPaneId: {
            ...state.byPaneId,
            [resolvedPaneId]: {
              ...paneState,
              currentIndex: newIndex,
            },
          },
        }));
        return paneState.history[newIndex] ?? null;
      },

      goForward: (paneId) => {
        const resolvedPaneId = resolvePaneId(paneId);
        const paneState = getPaneState(get().byPaneId, resolvedPaneId);
        if (paneState.currentIndex >= paneState.history.length - 1) return null;

        const newIndex = paneState.currentIndex + 1;
        set((state) => ({
          byPaneId: {
            ...state.byPaneId,
            [resolvedPaneId]: {
              ...paneState,
              currentIndex: newIndex,
            },
          },
        }));
        return paneState.history[newIndex] ?? null;
      },

      getPaneHistory: (paneId) => getPaneState(get().byPaneId, paneId),

      getBackHistory: (paneId) => {
        const paneState = getPaneState(get().byPaneId, paneId);
        return paneState.history
          .slice(0, paneState.currentIndex)
          .filter((item): item is NavigationHistoryItem => Boolean(item.contentId))
          .reverse();
      },

      clearHistory: (paneId) => {
        const resolvedPaneId = resolvePaneId(paneId);
        set((state) => {
          const nextState = { ...state.byPaneId };
          delete nextState[resolvedPaneId];
          return { byPaneId: nextState };
        });
      },
    }),
    {
      name: "navigation-history",
      version: CURRENT_VERSION,
      // Deferred hydration: back/forward navigation isn't on the critical
      // first-paint path. Defaults are empty histories; real values load
      // after FCP via lib/features/stores/deferred-store-hydrator.tsx.
      skipHydration: true,
      migrate: (persistedState) => {
        if (!persistedState || typeof persistedState !== "object") {
          return { byPaneId: {} };
        }

        const state = persistedState as Partial<NavigationHistoryStore>;

        return {
          ...state,
          byPaneId: Object.fromEntries(
            Object.entries(state.byPaneId ?? {}).map(([paneId, paneState]) => [
              paneId,
              sanitizePaneHistoryState(paneState),
            ])
          ),
        };
      },
    }
  )
);

export { EMPTY_PANE_HISTORY };
