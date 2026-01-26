/**
 * Context Menu Store
 *
 * Global state for context menu visibility and positioning.
 * Supports adaptive menus that change based on which panel triggered them.
 *
 * M4: File Tree Completion - Context Menu Infrastructure
 */

import { create } from "zustand";
import type { ContextMenuState, ContextMenuPanel, ContextMenuPosition } from "@/components/content/context-menu/types";

interface ContextMenuStore extends ContextMenuState {
  /** Open context menu */
  openMenu: (panel: ContextMenuPanel, position: ContextMenuPosition, context?: Record<string, any>) => void;
  /** Close context menu */
  closeMenu: () => void;
  /** Update context without repositioning */
  updateContext: (context: Record<string, any>) => void;
}

export const useContextMenuStore = create<ContextMenuStore>((set) => ({
  isOpen: false,
  position: null,
  panel: null,
  context: null,

  openMenu: (panel, position, context = {}) => {
    set({
      isOpen: true,
      panel,
      position,
      context,
    });
  },

  closeMenu: () => {
    set({
      isOpen: false,
      position: null,
      panel: null,
      context: null,
    });
  },

  updateContext: (context) => {
    set((state) => ({
      context: { ...state.context, ...context },
    }));
  },
}));
