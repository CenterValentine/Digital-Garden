"use client";

import dynamic from "next/dynamic";
import type { ExtensionContentViewerProps } from "@/lib/extensions/types";
import { READER_LIBRARY_CONTENT_ID, READER_VIRTUAL_PREFIX } from "../manifest";
import { LibraryView } from "./LibraryView";

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
  if (!selectedContentId) return null;
  if (selectedContentId === READER_LIBRARY_CONTENT_ID) return <LibraryView />;
  if (selectedContentId.startsWith(READER_VIRTUAL_PREFIX)) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        This reader source isn&apos;t available yet.
      </div>
    );
  }
  return <BookReader key={selectedContentId} contentId={selectedContentId} />;
}
