/**
 * Tree State Store
 *
 * Manages tree expansion state (which folders are open/closed).
 * Persists to localStorage for maintaining state across sessions.
 *
 * M4: File Tree Completion - Tree State Persistence
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface TreeStateStore {
  /** Set of expanded node IDs */
  expandedIds: Set<string>;
  /** Array of selected node IDs (for highlighting and active state) */
  selectedIds: string[];
  /** Toggle expansion state */
  toggleExpanded: (id: string) => void;
  /** Set expanded state */
  setExpanded: (id: string, expanded: boolean) => void;
  /** Expand multiple nodes */
  expandMany: (ids: string[]) => void;
  /** Collapse all nodes */
  collapseAll: () => void;
  /** Check if node is expanded */
  isExpanded: (id: string) => boolean;
  /** Set selected node IDs */
  setSelectedIds: (ids: string[]) => void;
}

export const useTreeStateStore = create<TreeStateStore>()(
  persist(
    (set, get) => ({
      expandedIds: new Set<string>(),
      selectedIds: [],

      toggleExpanded: (id) => {
        set((state) => {
          const newExpanded = new Set(state.expandedIds);
          if (newExpanded.has(id)) {
            newExpanded.delete(id);
          } else {
            newExpanded.add(id);
          }
          return { expandedIds: newExpanded };
        });
      },

      setExpanded: (id, expanded) => {
        set((state) => {
          const newExpanded = new Set(state.expandedIds);
          if (expanded) {
            newExpanded.add(id);
          } else {
            newExpanded.delete(id);
          }
          return { expandedIds: newExpanded };
        });
      },

      expandMany: (ids) => {
        set((state) => {
          const newExpanded = new Set(state.expandedIds);
          ids.forEach((id) => newExpanded.add(id));
          return { expandedIds: newExpanded };
        });
      },

      collapseAll: () => {
        set({ expandedIds: new Set<string>() });
      },

      isExpanded: (id) => {
        return get().expandedIds.has(id);
      },

      setSelectedIds: (ids) => {
        set({ selectedIds: ids });
      },
    }),
    {
      name: "tree-state-storage",
      version: 2, // Increment version for new selectedIds field
      // Custom serialization for Set
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          const { state } = JSON.parse(str);
          return {
            state: {
              ...state,
              expandedIds: new Set(state.expandedIds || []),
              selectedIds: state.selectedIds || [],
            },
          };
        },
        setItem: (name, value) => {
          const { state } = value;
          localStorage.setItem(
            name,
            JSON.stringify({
              state: {
                ...state,
                expandedIds: Array.from(state.expandedIds),
                selectedIds: state.selectedIds,
              },
            })
          );
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
    }
  )
);
