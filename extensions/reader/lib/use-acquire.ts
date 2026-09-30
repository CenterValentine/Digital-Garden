"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import type { BookMetaDto, CatalogEntry } from "@/lib/domain/reader/types";
import { withOptimisticTreeRow } from "@/lib/features/content/tree-optimistic";
import { useContentStore } from "@/state/content-store";
import { notifyBooksChanged } from "../state/bookshelf-store";
import { useReaderSession } from "../state/reader-store";
import { readerApi } from "./api";

export function openBookTab(contentId: string, title: string, kind: "file" | "link" = "file"): void {
  useContentStore.getState().setSelectedContentId(contentId, {
    title,
    contentType: kind === "link" ? "external" : "file",
    pin: true,
  });
}

/** Add a catalog book with no free download as a link to its source. */
export function useAddLink() {
  const parentId = useReaderSession((state) => state.libraryTargetParentId);
  return useCallback(
    async (sourceId: string, entry: CatalogEntry) => {
      try {
        const result = await withOptimisticTreeRow(
          { title: entry.title, contentType: "external", parentId },
          () => readerApi.addLink({ sourceId, entry, parentId }),
          (added) => (added.duplicate ? null : added.contentId)
        );
        notifyBooksChanged();
        toast.success(result.duplicate ? "Already in your library" : "Added to your library as a link", {
          description: entry.title,
          action: { label: "Open", onClick: () => openBookTab(result.contentId, entry.title, "link") },
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not add this book");
      }
    },
    [parentId]
  );
}

/** Add a catalog entry to the library (into the + menu's folder, if any). */
export function useAcquire() {
  const parentId = useReaderSession((state) => state.libraryTargetParentId);
  return useCallback(
    async (sourceId: string, entry: CatalogEntry, acquisitionIndex: number) => {
      try {
        // The row shows at the + target at once; the download fills it in.
        const result = await withOptimisticTreeRow(
          {
            title: entry.title,
            contentType: "file",
            parentId,
            mimeType: entry.acquisitions[acquisitionIndex]?.type.split(";")[0],
          },
          () => readerApi.acquire({ sourceId, entry, acquisitionIndex, parentId }),
          (added) => (added.duplicate ? null : added.contentId)
        );
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

/**
 * Drop a shortcut to a library book at `parentId` (server space), with an
 * optimistic row. "exists"/"home" create nothing, so the placeholder goes.
 */
export function placeShortcut(book: BookMetaDto, parentId: string | null) {
  return withOptimisticTreeRow(
    {
      title: book.title,
      contentType: "shortcut",
      parentId,
      shortcutTarget: {
        id: book.contentId,
        contentType: book.kind === "link" ? "external" : "file",
        title: book.title,
      },
    },
    () => readerApi.placeOnShelf({ contentId: book.contentId, parentId }),
    (placed) => (placed.outcome === "created" ? placed.shortcutId : null)
  );
}
