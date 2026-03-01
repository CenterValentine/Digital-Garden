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
  /** Currently active heading ID (for highlight in outline panel) */
  activeHeadingId: string | null;
  /** Update the outline */
  setOutline: (outline: OutlineHeading[]) => void;
  /** Set the active heading (clicked or scrolled-to) */
  setActiveHeadingId: (id: string | null) => void;
  /** Clear the outline (when no note selected) */
  clearOutline: () => void;
}

export const useOutlineStore = create<OutlineStore>((set) => ({
  outline: [],
  activeHeadingId: null,
  setOutline: (outline) => set({ outline }),
  setActiveHeadingId: (activeHeadingId) => set({ activeHeadingId }),
  clearOutline: () => set({ outline: [], activeHeadingId: null }),
}));
