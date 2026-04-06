/**
 * Notes Panel Store
 *
 * Tracks the universal open/closed state and position of the notes accordion
 * that appears on non-note content (folders, files, external links, etc.).
 *
 * Intentionally separate from UserSettings — this is a local UI preference
 * that doesn't need backend synchronisation.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type NotesPanelPosition = "above" | "below";

interface NotesPanelStore {
  isExpanded: boolean;
  position: NotesPanelPosition;
  toggleExpanded: () => void;
  setExpanded: (expanded: boolean) => void;
  setPosition: (position: NotesPanelPosition) => void;
  togglePosition: () => void;
}

export const useNotesPanelStore = create<NotesPanelStore>()(
  persist(
    (set, get) => ({
      isExpanded: false,
      position: "below",

      toggleExpanded: () => set((s) => ({ isExpanded: !s.isExpanded })),
      setExpanded: (expanded) => set({ isExpanded: expanded }),
      setPosition: (position) => set({ position }),
      togglePosition: () =>
        set((s) => ({ position: s.position === "below" ? "above" : "below" })),
    }),
    {
      name: "dg-notes-panel",
      version: 1,
    }
  )
);
