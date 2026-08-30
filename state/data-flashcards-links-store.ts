/**
 * Client cache of the user's database→flashcard-deck links.
 *
 * Fetched once per session from GET /api/flashcards/from-data and read
 * by every surface that needs to know "is this table/deck linked?":
 * the file-tree context menu (Create vs Sync label), the database
 * viewer's header button, the conversion dialog (prefill), and the
 * flashcards deck tree (per-deck sync button).
 *
 * ensureLoaded() is safe to call from anywhere, including the pure-
 * function context-menu provider — it kicks the fetch once and no-ops
 * after. refresh() re-fetches (called after a conversion or an explicit
 * sync, both of which can change the link set server-side).
 */

import { create } from "zustand";
import type { DataDeckLink } from "@/lib/domain/flashcards/from-data";

interface DataFlashcardsLinksState {
  links: DataDeckLink[];
  loaded: boolean;
  loading: boolean;
  ensureLoaded: () => void;
  refresh: () => Promise<void>;
}

export const useDataFlashcardsLinksStore = create<DataFlashcardsLinksState>(
  (set, get) => ({
    links: [],
    loaded: false,
    loading: false,
    ensureLoaded: () => {
      const s = get();
      if (s.loaded || s.loading) return;
      void s.refresh();
    },
    refresh: async () => {
      set({ loading: true });
      try {
        const res = await fetch("/api/flashcards/from-data", {
          credentials: "include",
        });
        const json = (await res.json()) as {
          success?: boolean;
          data?: DataDeckLink[];
        };
        set({
          links: json?.success && Array.isArray(json.data) ? json.data : [],
          loaded: true,
          loading: false,
        });
      } catch {
        // Mark loaded to avoid a retry storm; an explicit refresh() (post-
        // conversion, post-sync) will try again.
        set({ loaded: true, loading: false });
      }
    },
  }),
);

/** Most recent link for a table (a table can feed several decks). */
export function findTableLink(
  links: DataDeckLink[],
  tableId: string,
): DataDeckLink | undefined {
  return links.filter((l) => l.tableId === tableId).at(-1);
}
