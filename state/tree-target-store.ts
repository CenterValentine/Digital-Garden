/**
 * The file tree's current target — the folder the header's "+" adds to and its
 * sort menu reorders — published by the tree whenever the selection or the
 * tree changes (LeftSidebarContent), so the header can name it in tooltips and
 * show the sort it keeps. Not persisted: it is derived, live state.
 */
import { create } from "zustand";
import type { TreeLevelTarget } from "@/lib/domain/content/create-target";

interface TreeTargetState {
  target: TreeLevelTarget | null;
  setTarget: (target: TreeLevelTarget | null) => void;
}

export const useTreeTargetStore = create<TreeTargetState>()((set) => ({
  target: null,
  setTarget: (target) => set({ target }),
}));
