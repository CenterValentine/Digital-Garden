/**
 * Folder Move Store
 *
 * Persists recent "move into folder" destinations so the Folder Search
 * flyout can surface them before the user types. Mirrors the standard
 * Zustand `persist` convention used across the app's stores.
 *
 * Also holds the session-persistent "I'm feeling lucky" preference used by
 * the Phase 2 Folder Assistant (kept here so both Move surfaces share one
 * small store).
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface RecentFolder {
  id: string;
  title: string;
  /** Up to two nearest ancestor titles, nearest-last (e.g. ["Projects", "Web"]). */
  parentPath: string[];
  /** Epoch ms of the last time this folder was picked. */
  at: number;
}

interface FolderMoveState {
  recentFolders: RecentFolder[];
  /** Folder Assistant autonomy toggle (Phase 2) — persisted per user/device. */
  feelingLucky: boolean;
  pushRecent: (folder: Omit<RecentFolder, "at">) => void;
  clearRecents: () => void;
  setFeelingLucky: (value: boolean) => void;
}

const MAX_RECENTS = 8;

export const useFolderMoveStore = create<FolderMoveState>()(
  persist(
    (set) => ({
      recentFolders: [],
      feelingLucky: false,
      pushRecent: (folder) =>
        set((state) => {
          const deduped = state.recentFolders.filter((r) => r.id !== folder.id);
          return {
            recentFolders: [{ ...folder, at: Date.now() }, ...deduped].slice(
              0,
              MAX_RECENTS,
            ),
          };
        }),
      clearRecents: () => set({ recentFolders: [] }),
      setFeelingLucky: (value) => set({ feelingLucky: value }),
    }),
    { name: "folder-move-recents", version: 1 },
  ),
);
