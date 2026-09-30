"use client";

import { useEffect } from "react";
import { READER_BOOKS_CHANGED_EVENT, useReaderBookshelf } from "../state/bookshelf-store";

/** Shell controller: keeps the bookshelf cache warm for the "+" menu. */
export function ReaderBookshelfController() {
  useEffect(() => {
    const load = () => void useReaderBookshelf.getState().load();
    load();
    window.addEventListener(READER_BOOKS_CHANGED_EVENT, load);
    return () => window.removeEventListener(READER_BOOKS_CHANGED_EVENT, load);
  }, []);
  return null;
}
