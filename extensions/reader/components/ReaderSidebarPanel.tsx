"use client";

import { useState } from "react";
import { toast } from "sonner";
import { BookOpen } from "lucide-react";
import { READER_LIBRARY_CONTENT_ID } from "../manifest";
import { readerApi } from "../lib/api";
import { openBookTab, useAcquire, useAddLink } from "../lib/use-acquire";
import { useReaderSession } from "../state/reader-store";
import { BookDetailsPanel, queryFromEntry, subjectFromEntry } from "./BookDetailsPanel";

/**
 * Right-sidebar "Book" tab for reader content: details for the book selected
 * in the Library, or for the book open in the reader.
 */
export function ReaderSidebarPanel({ contentId }: { contentId: string }) {
  const selection = useReaderSession((state) => state.sidebarSelection[contentId] ?? null);
  const setSelection = useReaderSession((state) => state.setSidebarSelection);
  const targetParentId = useReaderSession((state) => state.libraryTargetParentId);
  const acquire = useAcquire();
  const addLink = useAddLink();
  const [placing, setPlacing] = useState(false);
  const inLibrary = contentId === READER_LIBRARY_CONTENT_ID;

  if (!selection) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
        <BookOpen className="h-8 w-8" />
        {inLibrary ? "Select a book to see its details." : "Loading book details…"}
      </div>
    );
  }

  const panelClass = "h-full rounded-none border-0";
  const close = inLibrary ? () => setSelection(contentId, null) : undefined;

  if (selection.kind === "entry") {
    const { sourceId, entry } = selection;
    return (
      <BookDetailsPanel
        key={`${sourceId}:${entry.id}`}
        className={panelClass}
        subject={subjectFromEntry(entry)}
        query={queryFromEntry(sourceId, entry)}
        entry={entry}
        onAdd={(target, index) => acquire(sourceId, target, index)}
        onAddLink={(target) => addLink(sourceId, target)}
        onClose={close}
      />
    );
  }

  const { book } = selection;
  const isOpenBook = book.contentId === contentId;
  return (
    <BookDetailsPanel
      key={book.contentId}
      className={panelClass}
      subject={{
        title: book.title,
        authors: book.authors,
        coverUrl: book.coverUrl,
        summary: book.description,
        publishedYear: book.publishedYear,
        language: book.language,
        license: book.license,
        isbn: book.isbn,
        publisher: book.publisher,
      }}
      query={{
        title: book.title,
        author: book.authors[0],
        isbn: book.isbn ?? undefined,
        openLibraryId: book.openLibraryId ?? undefined,
        contentId: book.contentId,
      }}
      onRead={isOpenBook ? undefined : () => openBookTab(book.contentId, book.title, book.kind ?? "file")}
      extraActions={
        inLibrary ? (
          <button
            type="button"
            disabled={placing}
            onClick={async () => {
              setPlacing(true);
              try {
                const result = await readerApi.placeOnShelf({
                  contentId: book.contentId,
                  parentId: targetParentId,
                });
                window.dispatchEvent(new CustomEvent("dg:tree-refresh"));
                toast.success(
                  result.outcome === "created"
                    ? "Shortcut added to the folder"
                    : result.outcome === "exists"
                      ? "That folder already has a shortcut to this book"
                      : "The book already lives in that folder"
                );
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Could not add the shortcut");
              } finally {
                setPlacing(false);
              }
            }}
            className="inline-flex h-8 items-center rounded border border-black/10 px-3 text-xs dark:border-white/10"
          >
            Add shortcut here
          </button>
        ) : null
      }
      onClose={close}
    />
  );
}
