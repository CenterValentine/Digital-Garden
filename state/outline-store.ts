/**
 * Outline Store
 *
 * Manages the current document's outline (table of contents).
 * Updated by MainPanelContent when editor content changes.
 * Consumed by RightSidebarContent for the Outline panel.
 */

import { create } from "zustand";
import type { OutlineHeading } from "@/lib/domain/content/outline-extractor";

interface OutlineStore {
  /** Current outline headings */
  outline: OutlineHeading[];
  /** Update the outline */
  setOutline: (outline: OutlineHeading[]) => void;
  /** Clear the outline (when no note selected) */
  clearOutline: () => void;
}

export const useOutlineStore = create<OutlineStore>((set) => ({
  outline: [],
  setOutline: (outline) => set({ outline }),
  clearOutline: () => set({ outline: [] }),
}));
