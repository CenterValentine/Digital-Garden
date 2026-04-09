"use client";

import { PersonWorkspace } from "@/components/content/people/PersonWorkspace";
import type { ExtensionContentViewerProps } from "@/lib/extensions/types";

export function PeopleContentViewer({
  paneId,
  selectedContentId,
}: ExtensionContentViewerProps) {
  if (!selectedContentId?.startsWith("person:")) {
    return null;
  }

  return (
    <PersonWorkspace
      personId={selectedContentId.replace("person:", "")}
      paneId={paneId}
    />
  );
}
