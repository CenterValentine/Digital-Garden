/**
 * The file tree's current targets, published by the tree whenever the
 * selection or the tree changes (LeftSidebarContent), so the header can name
 * them in tooltips and show the sort they keep. Not persisted: derived state.
 *
 *  - addTarget  — the folder the header's "+" adds to.
 *  - sortTarget — what the sort menu sorts: the same folder, or — when a
 *    shortcut to a folder is selected (or a row inside one) — that SHORTCUT's
 *    own view (owner, 2026-10-06).
 */
import { create } from "zustand";
import type { TreeLevelTarget } from "@/lib/domain/content/create-target";

interface TreeTargetState {
  addTarget: TreeLevelTarget | null;
  sortTarget: TreeLevelTarget | null;
  setTargets: (targets: { addTarget: TreeLevelTarget | null; sortTarget: TreeLevelTarget | null }) => void;
}

export const useTreeTargetStore = create<TreeTargetState>()((set) => ({
  addTarget: null,
  sortTarget: null,
  setTargets: (targets) => set(targets),
}));
