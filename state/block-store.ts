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
  /** Real node attrs of the selected block — set immediately on selection */
  selectedBlockAttrs: Record<string, unknown> | null;
  /** Whether the Properties Panel is open */
  propertiesPanelOpen: boolean;

  /** Set the selected block, optionally with its current attrs */
  setSelectedBlock: (blockId: string, blockType: string, attrs?: Record<string, unknown>) => void;
  /** Update attrs for the currently selected block */
  setSelectedBlockAttrs: (attrs: Record<string, unknown>) => void;
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
  selectedBlockAttrs: null,
  propertiesPanelOpen: false,

  setSelectedBlock: (blockId, blockType, attrs) =>
    set({ selectedBlockId: blockId, selectedBlockType: blockType, selectedBlockAttrs: attrs ?? null }),

  setSelectedBlockAttrs: (attrs) =>
    set({ selectedBlockAttrs: attrs }),

  clearSelection: () =>
    set({ selectedBlockId: null, selectedBlockType: null, selectedBlockAttrs: null }),

  toggleProperties: () =>
    set((state) => ({ propertiesPanelOpen: !state.propertiesPanelOpen })),

  openProperties: () => set({ propertiesPanelOpen: true }),
}));
