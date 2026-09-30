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
  /** Open books, keyed by book content id. */
  openBooks: Record<string, ReaderOpenBook>;
  setOpenBook: (contentId: string, book: ReaderOpenBook | null) => void;
  /** Which half of the Book tab shows, per book. */
  sidebarView: Record<string, ReaderSidebarView>;
  setSidebarView: (contentId: string, view: ReaderSidebarView) => void;
  /** Last search per open item, so switching sidebar views doesn't lose it. */
  searches: Record<string, { query: string; hits: ReaderSearchHit[]; done: boolean; note?: string }>;
  setSearch: (contentId: string, search: { query: string; hits: ReaderSearchHit[]; done: boolean; note?: string } | null) => void;
}

/** A table-of-contents entry of the open book. */
export interface ReaderTocItem {
  label: string;
  href: string;
  subitems?: ReaderTocItem[];
}

/**
 * What an open book publishes for the right sidebar's Book tab: its
 * highlights (with the actions on them) and its contents. The reader keeps no
 * side panels of its own — the app's right sidebar is where these live.
 */
export interface ReaderOpenBook {
  annotations: ReaderAnnotationDto[];
  go: (annotation: ReaderAnnotationDto) => void;
  remove: (annotation: ReaderAnnotationDto) => void;
  update: (annotation: ReaderAnnotationDto, input: { color?: string; body?: string | null }) => void;
  sent: (annotation: ReaderAnnotationDto) => void;
  toc: ReaderTocItem[];
  /** Chapter the reader is in now (highlighted in Contents). */
  currentLabel?: string;
  goToHref: (href: string) => void;
  /** Full-text search inside what's open (the sidebar's Search view). */
  search?: ReaderSearchCapability;
}

/** One search result: where it is, and the words around the match. */
export interface ReaderSearchHit {
  id: string;
  /** Where ("Alma 32:21", a chapter title). */
  label: string;
  excerpt?: { pre: string; match: string; post: string };
  /** A jump that isn't a text match ("Go to Alma 32:21"). */
  kind?: "match" | "jump";
}

export interface ReaderSearchCapability {
  placeholder: string;
  /** Run a search; `onHits` may be called repeatedly as results stream in. */
  run: (query: string, onHits: (hits: ReaderSearchHit[], done: boolean, note?: string) => void) => () => void;
  go: (hit: ReaderSearchHit) => void;
  /** Clear marks a search left on the page. */
  clear?: () => void;
}

export type ReaderSidebarView = "notes" | "contents" | "search" | "settings" | "about";

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
  openBooks: {},
  setOpenBook: (contentId, book) =>
    set((state) => {
      const next = { ...state.openBooks };
      if (book) next[contentId] = book;
      else delete next[contentId];
      return { openBooks: next };
    }),
  sidebarView: {},
  setSidebarView: (contentId, view) =>
    set((state) => ({ sidebarView: { ...state.sidebarView, [contentId]: view } })),
  searches: {},
  setSearch: (contentId, search) =>
    set((state) => {
      const next = { ...state.searches };
      if (search) next[contentId] = search;
      else delete next[contentId];
      return { searches: next };
    }),
}));
