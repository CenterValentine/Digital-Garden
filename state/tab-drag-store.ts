/**
 * Tab drag store.
 *
 * Bridges a tab-strip drag to drop targets outside the pane subtree (the
 * workplaces affordance in the shell nav). The strip's own targets read the
 * dragged id from MainPanelWorkspace's local state, which nothing else can
 * see, and `dataTransfer.getData()` is empty during `dragover` by spec — so
 * a remote target could not even tell a tab drag from a workspace-reorder
 * drag while hovering. Same pattern as `tree-drag-store`: the source records
 * itself on drag-start, clears on drag-end; targets read it on hover/drop.
 */

import { create } from "zustand";
import type { WorkspacePaneId } from "./content-store";

/** Custom mime set alongside `text/plain` so `dataTransfer.types` can discriminate. */
export const TAB_DRAG_MIME = "application/x-dg-tab";

export interface DraggingTab {
  id: string;
  contentId: string;
  title: string;
  contentType: string | null;
  /** Pane the tab left — the placement hint a move carries. */
  paneId: WorkspacePaneId;
}

interface TabDragState {
  draggingTab: DraggingTab | null;
  setDraggingTab: (tab: DraggingTab | null) => void;
}

export const useTabDragStore = create<TabDragState>((set) => ({
  draggingTab: null,
  setDraggingTab: (tab) => set({ draggingTab: tab }),
}));
