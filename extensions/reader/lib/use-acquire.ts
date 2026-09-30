"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import type { CatalogEntry } from "@/lib/domain/reader/types";
import { useContentStore } from "@/state/content-store";
import { notifyBooksChanged } from "../state/bookshelf-store";
import { useReaderSession } from "../state/reader-store";
import { readerApi } from "./api";

export function openBookTab(contentId: string, title: string): void {
  useContentStore.getState().setSelectedContentId(contentId, {
    title,
    contentType: "file",
    pin: true,
  });
}

/** Add a catalog entry to the library (into the + menu's folder, if any). */
export function useAcquire() {
  const parentId = useReaderSession((state) => state.libraryTargetParentId);
  return useCallback(
    async (sourceId: string, entry: CatalogEntry, acquisitionIndex: number) => {
      try {
        const result = await readerApi.acquire({ sourceId, entry, acquisitionIndex, parentId });
        window.dispatchEvent(new CustomEvent("dg:tree-refresh"));
        notifyBooksChanged();
        toast.success(result.duplicate ? "Already in your library" : "Added to your library", {
          description: entry.title,
          action: { label: "Read", onClick: () => openBookTab(result.contentId, entry.title) },
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not add this book");
      }
    },
    [parentId]
  );
}
