/**
 * Navigation History Store
 *
 * Manages back/forward navigation history for the main content panel.
 * Features:
 * - Browser-like history stack with back/forward support
 * - Deduplication (only most recent visit counts)
 * - Max 100 items to prevent memory issues
 * - localStorage persistence
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

const MAX_HISTORY_ITEMS = 100;

export interface NavigationHistoryItem {
  contentId: string | null;
  timestamp: number;
}

interface NavigationHistoryStore {
  // State
  history: NavigationHistoryItem[];
  currentIndex: number;

  // Actions
  addToHistory: (contentId: string | null) => void;
  goBack: () => string | null;
  goForward: () => string | null;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
  getBackHistory: () => NavigationHistoryItem[];
  clearHistory: () => void;
}

export const useNavigationHistoryStore = create<NavigationHistoryStore>()(
  persist(
    (set, get) => ({
      history: [],
      currentIndex: -1,

      addToHistory: (contentId: string | null) => {
        set((state) => {
          // Get current state
          const { history, currentIndex } = state;

          // If we're in the middle of history (user went back), truncate forward history
          const truncatedHistory = history.slice(0, currentIndex + 1);

          // Check if the new content is the same as current (avoid duplicate consecutive entries)
          if (
            history.length > 0 &&
            currentIndex >= 0 &&
            history[currentIndex].contentId === contentId
          ) {
            // Same content at current index, just update timestamp WITHOUT truncating forward history
            const updatedHistory = [...history];
            updatedHistory[currentIndex] = { contentId, timestamp: Date.now() };
            return {
              history: updatedHistory,
              currentIndex: currentIndex,
            };
          }

          // Remove older duplicate entries of this contentId (keep only most recent)
          const deduplicated = truncatedHistory.filter(
            (item) => item.contentId !== contentId
          );

          // Add new entry
          const newHistory = [
            ...deduplicated,
            { contentId, timestamp: Date.now() },
          ];

          // Enforce max limit (keep most recent items)
          const limitedHistory =
            newHistory.length > MAX_HISTORY_ITEMS
              ? newHistory.slice(newHistory.length - MAX_HISTORY_ITEMS)
              : newHistory;

          return {
            history: limitedHistory,
            currentIndex: limitedHistory.length - 1,
          };
        });
      },

      goBack: () => {
        const { history, currentIndex } = get();
        if (currentIndex <= 0) return null;

        const newIndex = currentIndex - 1;
        set({ currentIndex: newIndex });
        return history[newIndex].contentId;
      },

      goForward: () => {
        const { history, currentIndex } = get();
        if (currentIndex >= history.length - 1) return null;

        const newIndex = currentIndex + 1;
        set({ currentIndex: newIndex });
        return history[newIndex].contentId;
      },

      canGoBack: () => {
        const { currentIndex } = get();
        return currentIndex > 0;
      },

      canGoForward: () => {
        const { history, currentIndex } = get();
        return currentIndex < history.length - 1;
      },

      getBackHistory: () => {
        const { history, currentIndex } = get();
        // Return items before current index in reverse order (most recent first)
        return history.slice(0, currentIndex).reverse();
      },

      clearHistory: () => {
        set({ history: [], currentIndex: -1 });
      },
    }),
    {
      name: "navigation-history",
      version: 1,
    }
  )
);
