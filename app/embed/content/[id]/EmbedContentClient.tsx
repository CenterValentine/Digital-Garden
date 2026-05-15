"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MainPanelWorkspace } from "@/components/content/MainPanelWorkspace";
import { EditorSkeleton } from "@/components/content/skeletons/EditorSkeleton";
import { useContentStore } from "@/state/content-store";
import { useRightPanelCollapseStore } from "@/state/right-panel-collapse-store";
import { useEditorStatsStore } from "@/state/editor-stats-store";
import type { ContentType } from "@/lib/domain/content/types";

interface EmbedContentClientProps {
  initialContentId: string;
  contentType: ContentType;
}

/**
 * postMessage protocol (messages sent TO parent overlay):
 *   {type:"ready"}               — iframe is mounted and content is loaded
 *   {type:"dirty"}               — unsaved changes exist
 *   {type:"saved"}               — autosave completed
 *   {type:"title-changed", title} — active note title changed
 *   {type:"navigate", contentId}  — user clicked a wiki-link (Session 3)
 *
 * Messages received FROM parent overlay:
 *   {type:"open", contentId}     — navigate to a different content item
 */
export function EmbedContentClient({
  initialContentId,
}: EmbedContentClientProps) {
  const restoreWorkspace = useContentStore((s) => s.restoreWorkspace);
  const setCollapsed = useRightPanelCollapseStore((s) => s.setCollapsed);
  const [ready, setReady] = useState(false);

  // Track current contentId so incoming `open` messages can trigger a swap
  const currentContentId = useRef(initialContentId);

  function openContent(contentId: string) {
    currentContentId.current = contentId;
    restoreWorkspace({
      activeContentId: contentId,
      layoutMode: "single",
      paneTabContentIds: { "top-left": [contentId] },
    });
  }

  useLayoutEffect(() => {
    openContent(initialContentId);
    setCollapsed(true);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- audited, see BACKLOG.md
    setReady(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Post `ready` once the workspace is set up
  useEffect(() => {
    if (!ready) return;
    window.parent.postMessage({ type: "ready" }, "*");
  }, [ready]);

  // Bridge isSaving → dirty / saved postMessages
  useEffect(() => {
    let wasSaving = false;
    const unsub = useEditorStatsStore.subscribe((state) => {
      if (state.isSaving && !wasSaving) {
        window.parent.postMessage({ type: "dirty" }, "*");
      }
      if (!state.isSaving && wasSaving) {
        window.parent.postMessage({ type: "saved" }, "*");
      }
      wasSaving = state.isSaving;
    });
    return unsub;
  }, []);

  // Bridge title changes → title-changed postMessage
  useEffect(() => {
    let lastTitle = "";
    const unsub = useContentStore.subscribe((state) => {
      const activeId = state.selectedContentId;
      if (!activeId) return;
      const tabId = Object.keys(state.tabs).find(
        (k) => state.tabs[k].contentId === activeId
      );
      const title = tabId ? state.tabs[tabId].title : "";
      if (title && title !== lastTitle && title !== "Loading...") {
        lastTitle = title;
        window.parent.postMessage({ type: "title-changed", title }, "*");
      }
    });
    return unsub;
  }, []);

  // Listen for `open` messages from the parent overlay
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (!event.data || typeof event.data !== "object") return;
      if (event.data.type === "open" && event.data.contentId) {
        openContent(event.data.contentId as string);
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) return <EditorSkeleton />;

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <MainPanelWorkspace />
    </div>
  );
}
