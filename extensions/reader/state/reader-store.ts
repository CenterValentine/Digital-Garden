import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BookMetaDto, CatalogEntry, ReaderAnnotationDto } from "@/lib/domain/reader/types";

export type ReaderTheme = "system" | "light" | "sepia" | "dark";
export type ReaderFlow = "paginated" | "scrolled";

interface ReaderPreferencesState {
  fontSizePct: number;
  lineHeight: number;
  theme: ReaderTheme;
  flow: ReaderFlow;
  highlightColor: string;
  setFontSizePct: (value: number) => void;
  setLineHeight: (value: number) => void;
  setTheme: (theme: ReaderTheme) => void;
  setFlow: (flow: ReaderFlow) => void;
  setHighlightColor: (color: string) => void;
}

/** Per-device reading preferences (typography is a device concern). */
export const useReaderPreferences = create<ReaderPreferencesState>()(
  persist(
    (set) => ({
      fontSizePct: 100,
      lineHeight: 1.5,
      theme: "system",
      flow: "paginated",
      highlightColor: "yellow",
      setFontSizePct: (value) =>
        set({ fontSizePct: Math.min(200, Math.max(70, Math.round(value))) }),
      setLineHeight: (value) =>
        set({ lineHeight: Math.min(2.2, Math.max(1.1, Number(value.toFixed(2)))) }),
      setTheme: (theme) => set({ theme }),
      setFlow: (flow) => set({ flow }),
      setHighlightColor: (highlightColor) => set({ highlightColor }),
    }),
    { name: "reader:preferences", version: 1 }
  )
);

/** What the right-sidebar Book panel shows for a given reader tab. */
export type ReaderSidebarSelection =
  | { kind: "entry"; sourceId: string; entry: CatalogEntry }
  | { kind: "book"; book: BookMetaDto };

interface ReaderSessionState {
  /** Folder chosen via "+ → Reader → Books" in a folder's Add menu. */
  libraryTargetParentId: string | null;
  setLibraryTargetParentId: (parentId: string | null) => void;
  /** Keyed by the tab's content id (reader:library, or a book file id). */
  sidebarSelection: Record<string, ReaderSidebarSelection>;
  setSidebarSelection: (contentId: string, selection: ReaderSidebarSelection | null) => void;
  /** Open books' highlights, keyed by book content id. */
  bookNotes: Record<string, ReaderBookNotesBridge>;
  setBookNotes: (contentId: string, bridge: ReaderBookNotesBridge | null) => void;
  /** Which half of the Book tab shows, per book. */
  sidebarView: Record<string, ReaderSidebarView>;
  setSidebarView: (contentId: string, view: ReaderSidebarView) => void;
}

/**
 * An open book's highlights, published by BookReader so the right sidebar's
 * Book tab can list and act on them (the reader has no side panel of its own).
 */
export interface ReaderBookNotesBridge {
  annotations: ReaderAnnotationDto[];
  go: (annotation: ReaderAnnotationDto) => void;
  remove: (annotation: ReaderAnnotationDto) => void;
  update: (annotation: ReaderAnnotationDto, input: { color?: string; body?: string | null }) => void;
  sent: (annotation: ReaderAnnotationDto) => void;
}

export type ReaderSidebarView = "notes" | "about";

/** Ephemeral (not persisted) cross-component reader state. */
export const useReaderSession = create<ReaderSessionState>()((set) => ({
  libraryTargetParentId: null,
  setLibraryTargetParentId: (libraryTargetParentId) => set({ libraryTargetParentId }),
  sidebarSelection: {},
  setSidebarSelection: (contentId, selection) =>
    set((state) => {
      const next = { ...state.sidebarSelection };
      if (selection) next[contentId] = selection;
      else delete next[contentId];
      return { sidebarSelection: next };
    }),
  bookNotes: {},
  setBookNotes: (contentId, bridge) =>
    set((state) => {
      const next = { ...state.bookNotes };
      if (bridge) next[contentId] = bridge;
      else delete next[contentId];
      return { bookNotes: next };
    }),
  sidebarView: {},
  setSidebarView: (contentId, view) =>
    set((state) => ({ sidebarView: { ...state.sidebarView, [contentId]: view } })),
}));
