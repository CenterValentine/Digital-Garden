"use client";

import { useLayoutEffect, useState } from "react";
import { MainPanelWorkspace } from "./MainPanelWorkspace";
import { EditorSkeleton } from "./skeletons/EditorSkeleton";
import { useContentStore, TOP_LEFT_PANE_ID } from "@/state/content-store";
import { ExtensionFocusBridge } from "./ExtensionFocusBridge";

interface FocusContentWorkspaceProps {
  contentId: string;
}

/**
 * Focus route host. Layout-intent spec §6.2: this used to restoreWorkspace
 * ({layoutMode:"single", one tab}) + setCollapsed(true) — ghost-writes that
 * REPLACED the workspace's intent store-wide, so leaving focus persisted a
 * single-pane clobber over the real layout. Now:
 * - single-pane rendering comes from useProjectedLayout (route-keyed, pure);
 * - the right sidebar's focus presentation is already route-keyed inside
 *   CollapsibleRightPanel (the setCollapsed write was redundant);
 * - the only state change left is honest navigation: open the target content
 *   in the primary pane (a legitimate R1 open event).
 */
export function FocusContentWorkspace({ contentId }: FocusContentWorkspaceProps) {
  const openContentInPane = useContentStore((state) => state.openContentInPane);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    openContentInPane(contentId, TOP_LEFT_PANE_ID);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- audited, see BACKLOG.md
    setReady(true);
  }, [contentId, openContentInPane]);

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
