import { create } from "zustand";
import type { BookMetaDto } from "@/lib/domain/reader/types";
import { readerApi } from "../lib/api";

/** Fired after a book is added/removed so every bookshelf view refreshes. */
export const READER_BOOKS_CHANGED_EVENT = "dg:reader-books-changed";

interface BookshelfState {
  books: BookMetaDto[];
  loaded: boolean;
  load: () => Promise<void>;
}

/**
 * The user's books, cached for surfaces that must render synchronously —
 * the "+" menu is built at open time and can't await a fetch.
 */
export const useReaderBookshelf = create<BookshelfState>()((set) => ({
  books: [],
  loaded: false,
  load: async () => {
    try {
      const { books } = await readerApi.books();
      set({ books, loaded: true });
    } catch {
      // Not migrated / offline: the menu just shows the Library entry.
      set({ loaded: true });
    }
  },
}));

export function notifyBooksChanged(): void {
  window.dispatchEvent(new CustomEvent(READER_BOOKS_CHANGED_EVENT));
}
