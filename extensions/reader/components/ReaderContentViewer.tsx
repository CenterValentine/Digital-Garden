"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import type { ExtensionContentViewerProps } from "@/lib/extensions/types";
import { useContentSidebarClaims } from "@/lib/extensions/content-sidebar";
import {
  READER_EXTENSION_ID,
  READER_LIBRARY_CONTENT_ID,
  READER_VIRTUAL_PREFIX,
} from "../manifest";
import { LibraryView } from "./LibraryView";
import { ReaderErrorBoundary } from "./ReaderErrorBoundary";

// foliate-js is browser-only (custom elements, Blob URLs) — never SSR it.
const BookReader = dynamic(
  () => import("./BookReader").then((module) => module.BookReader),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Opening book…
      </div>
    ),
  }
);

export function ReaderContentViewer({ selectedContentId }: ExtensionContentViewerProps) {
  // The right sidebar follows what the reader shows: claim its Book tab for
  // this content while mounted.
  useEffect(() => {
    if (!selectedContentId) return;
    const { claim, release } = useContentSidebarClaims.getState();
    claim(selectedContentId, READER_EXTENSION_ID);
    return () => release(selectedContentId, READER_EXTENSION_ID);
  }, [selectedContentId]);

  if (!selectedContentId) return null;
  return (
    <ReaderErrorBoundary resetKey={selectedContentId}>
      {selectedContentId === READER_LIBRARY_CONTENT_ID ? (
        <LibraryView />
      ) : selectedContentId.startsWith(READER_VIRTUAL_PREFIX) ? (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          This reader source isn&apos;t available yet.
        </div>
      ) : (
        <BookReader key={selectedContentId} contentId={selectedContentId} />
      )}
    </ReaderErrorBoundary>
  );
}
