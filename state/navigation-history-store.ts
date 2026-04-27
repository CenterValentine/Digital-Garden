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
}

export interface PaneHistoryState {
  history: NavigationHistoryItem[];
  currentIndex: number;
}

interface NavigationHistoryStore {
  byPaneId: Record<string, PaneHistoryState>;
  addToHistory: (contentId: string | null, paneId?: string | null, meta?: { title?: string; contentType?: string }) => void;
  goBack: (paneId?: string | null) => string | null;
  goForward: (paneId?: string | null) => string | null;
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
        return paneState.history[newIndex]?.contentId ?? null;
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
        return paneState.history[newIndex]?.contentId ?? null;
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
