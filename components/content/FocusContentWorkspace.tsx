"use client";

import { useLayoutEffect, useState } from "react";
import { MainPanelWorkspace } from "./MainPanelWorkspace";
import { EditorSkeleton } from "./skeletons/EditorSkeleton";
import { useContentStore } from "@/state/content-store";
import { useRightPanelCollapseStore } from "@/state/right-panel-collapse-store";
import { ExtensionFocusBridge } from "./ExtensionFocusBridge";

interface FocusContentWorkspaceProps {
  contentId: string;
}

export function FocusContentWorkspace({ contentId }: FocusContentWorkspaceProps) {
  const restoreWorkspace = useContentStore((state) => state.restoreWorkspace);
  const [ready, setReady] = useState(false);
  const setCollapsed = useRightPanelCollapseStore((state) => state.setCollapsed);

  useLayoutEffect(() => {
    restoreWorkspace({
      activeContentId: contentId,
      layoutMode: "single",
      paneTabContentIds: {
        "top-left": [contentId],
      },
    });
    setCollapsed(true);
    setReady(true);
  }, [contentId, restoreWorkspace, setCollapsed]);

  if (!ready) {
    return <EditorSkeleton />;
  }

  return (
    <>
      <ExtensionFocusBridge />
      <MainPanelWorkspace />
    </>
  );
}
