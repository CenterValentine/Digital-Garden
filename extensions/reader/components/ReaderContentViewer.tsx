"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import type { ExtensionContentViewerProps } from "@/lib/extensions/types";
import { useContentSidebarClaims } from "@/lib/extensions/content-sidebar";
import {
  READER_EXTENSION_ID,
  READER_LIBRARY_CONTENT_ID,
  READER_RESEARCH_CONTENT_ID,
  READER_SCRIPTURES_CONTENT_ID,
  READER_VIRTUAL_PREFIX,
} from "../manifest";
import { corpusIdFromTabId, SCRIPTURE_RESOURCE_TYPE } from "@/lib/domain/scripture/types";
import { LibraryView } from "./LibraryView";
import { ResearchView } from "./research/ResearchView";
import { ScriptureCatalog } from "./ScriptureCatalog";
import { ScriptureReader } from "./ScriptureReader";
import { ScriptureSessionViewer } from "./ScriptureSessionViewer";
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

export function ReaderContentViewer({
  selectedContentId,
  contentType,
  externalResourceType,
  paneId,
}: ExtensionContentViewerProps) {
  // The right sidebar follows what the reader shows: claim its Book tab for
  // this content while mounted.
  useEffect(() => {
    if (!selectedContentId) return;
    const { claim, release } = useContentSidebarClaims.getState();
    claim(selectedContentId, READER_EXTENSION_ID);
    return () => release(selectedContentId, READER_EXTENSION_ID);
  }, [selectedContentId]);

  if (!selectedContentId) return null;
  const corpusId = corpusIdFromTabId(selectedContentId);
  return (
    <ReaderErrorBoundary resetKey={selectedContentId}>
      {selectedContentId === READER_LIBRARY_CONTENT_ID ? (
        <LibraryView />
      ) : selectedContentId === READER_RESEARCH_CONTENT_ID ? (
        <ResearchView />
      ) : selectedContentId === READER_SCRIPTURES_CONTENT_ID ? (
        <div className="h-full overflow-auto p-6">
          <div className="mx-auto max-w-3xl">
            <ScriptureCatalog />
          </div>
        </div>
      ) : contentType === "external" && externalResourceType === SCRIPTURE_RESOURCE_TYPE ? (
        <ScriptureSessionViewer key={selectedContentId} contentId={selectedContentId} paneId={paneId} />
      ) : corpusId ? (
        <ScriptureReader key={selectedContentId} corpusId={corpusId} contentId={selectedContentId} paneId={paneId} />
      ) : selectedContentId.startsWith(READER_VIRTUAL_PREFIX) ? (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          This reader source isn&apos;t available yet.
        </div>
      ) : contentType === "file" ? (
        <BookReader key={selectedContentId} contentId={selectedContentId} />
      ) : null /* nothing of the reader's: never mount the book reader on a guess */}
    </ReaderErrorBoundary>
  );
}
