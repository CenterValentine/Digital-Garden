/**
 * Block Selection Store
 *
 * Zustand store tracking which block is currently selected in the editor.
 * Consumed by the Properties Panel to show/edit block attributes.
 *
 * Epoch 11 Sprint 43
 */

import { create } from "zustand";

interface BlockStore {
  /** Currently selected block's ID (blockId attr) */
  selectedBlockId: string | null;
  /** Currently selected block's type key */
  selectedBlockType: string | null;
  /** Whether the Properties Panel is open */
  propertiesPanelOpen: boolean;

  /** Set the selected block */
  setSelectedBlock: (blockId: string, blockType: string) => void;
  /** Clear block selection */
  clearSelection: () => void;
  /** Toggle the Properties Panel */
  toggleProperties: () => void;
  /** Open the Properties Panel */
  openProperties: () => void;
}

export const useBlockStore = create<BlockStore>()((set) => ({
  selectedBlockId: null,
  selectedBlockType: null,
  propertiesPanelOpen: false,

  setSelectedBlock: (blockId, blockType) =>
    set({ selectedBlockId: blockId, selectedBlockType: blockType }),

  clearSelection: () =>
    set({ selectedBlockId: null, selectedBlockType: null }),

  toggleProperties: () =>
    set((state) => ({ propertiesPanelOpen: !state.propertiesPanelOpen })),

  openProperties: () => set({ propertiesPanelOpen: true }),
}));
