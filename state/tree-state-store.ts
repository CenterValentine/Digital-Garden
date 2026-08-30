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
  /**
   * Node IDs whose reference block renders BEFORE their primary children.
   *
   * Kept as its own set rather than folded into `expandedIds` under a prefix:
   * "is expanded" and "sits at the start" are independent facts about a row,
   * and overloading one set to mean both makes every read ambiguous. Absence
   * means the default — references render after primary content.
   */
  referencesAtStartIds: Set<string>;
  /**
   * Shortcut rows whose mirror should hide FURTHER shortcuts.
   *
   * A mirrored folder shows whatever that folder contains, shortcuts included
   * — so a shortcut can surface more shortcuts, each of which expands into
   * another mirror. That is legitimate but noisy, and it is the shape that
   * makes a cycle reachable in one click. Absence means the default: nested
   * shortcuts are shown.
   */
  hiddenNestedShortcutIds: Set<string>;
  /** Array of selected node IDs (for highlighting and active state) */
  selectedIds: string[];
  /** Virtualized tree scroll offset */
  scrollOffset: number;
  /** Bumps when a workspace-level tree snapshot is restored */
  restoreVersion: number;
  /** Toggle expansion state */
  toggleExpanded: (id: string) => void;
  /** Flip this row's reference block between start and end of its children */
  toggleReferencePosition: (id: string) => void;
  /** Show/hide shortcuts nested inside this shortcut's mirror */
  toggleNestedShortcuts: (id: string) => void;
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
  /** Set tree scroll offset */
  setScrollOffset: (offset: number) => void;
  /** Capture file-tree UI state for workspace switching */
  getSnapshot: () => TreeStateSnapshot;
  /** Restore file-tree UI state for workspace switching */
  restoreSnapshot: (snapshot?: TreeStateSnapshot | null) => void;
}

export interface TreeStateSnapshot {
  expandedIds: string[];
  referencesAtStartIds: string[];
  hiddenNestedShortcutIds: string[];
  selectedIds: string[];
  scrollOffset: number;
}

export const useTreeStateStore = create<TreeStateStore>()(
  persist(
    (set, get) => ({
      expandedIds: new Set<string>(),
      referencesAtStartIds: new Set<string>(),
      hiddenNestedShortcutIds: new Set<string>(),
      selectedIds: [],
      scrollOffset: 0,
      restoreVersion: 0,

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

      toggleReferencePosition: (id) => {
        set((state) => {
          const next = new Set(state.referencesAtStartIds);
          if (next.has(id)) {
            next.delete(id);
          } else {
            next.add(id);
          }
          return { referencesAtStartIds: next };
        });
      },

      toggleNestedShortcuts: (id) => {
        set((state) => {
          const next = new Set(state.hiddenNestedShortcutIds);
          if (next.has(id)) {
            next.delete(id);
          } else {
            next.add(id);
          }
          return { hiddenNestedShortcutIds: next };
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

      setScrollOffset: (offset) => {
        set({ scrollOffset: Math.max(0, offset) });
      },

      getSnapshot: () => ({
        expandedIds: Array.from(get().expandedIds),
        referencesAtStartIds: Array.from(get().referencesAtStartIds),
        hiddenNestedShortcutIds: Array.from(get().hiddenNestedShortcutIds),
        selectedIds: get().selectedIds,
        scrollOffset: get().scrollOffset,
      }),

      restoreSnapshot: (snapshot) => {
        set((state) => ({
          expandedIds: new Set(snapshot?.expandedIds ?? []),
          referencesAtStartIds: new Set(snapshot?.referencesAtStartIds ?? []),
          hiddenNestedShortcutIds: new Set(snapshot?.hiddenNestedShortcutIds ?? []),
          selectedIds: snapshot?.selectedIds ?? [],
          scrollOffset: snapshot?.scrollOffset ?? 0,
          restoreVersion: state.restoreVersion + 1,
        }));
      },
    }),
    {
      name: "tree-state-storage",
      version: 4, // v4: hiddenNestedShortcutIds (nested-shortcut visibility)
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
                // Absent in v2 payloads — an empty set means "every reference
                // block sits at the end", which is the pre-existing behaviour.
                referencesAtStartIds: new Set(state.referencesAtStartIds || []),
                // Absent in v3 payloads — empty means nested shortcuts show.
                hiddenNestedShortcutIds: new Set(state.hiddenNestedShortcutIds || []),
                selectedIds: state.selectedIds || [],
                scrollOffset: state.scrollOffset || 0,
                restoreVersion: state.restoreVersion || 0,
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
                referencesAtStartIds: Array.from(state.referencesAtStartIds),
                hiddenNestedShortcutIds: Array.from(state.hiddenNestedShortcutIds),
                selectedIds: state.selectedIds,
                scrollOffset: state.scrollOffset,
              },
            })
          );
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
    }
  )
);
