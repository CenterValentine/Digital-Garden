"use client";

/**
 * Artifact-open helpers (AI v3.1 R1 — mid-run review without leaving the
 * run). AI-created artifact cards (notes, docx, workflows) open in a
 * SPLIT PANE so reviewing a deliverable never displaces the running
 * conversation. Uses the workspace multi-pane infrastructure directly —
 * same idiom as the editor context menu's wiki-link pane actions.
 */

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { PanelRight, ArrowUpRight } from "lucide-react";
import {
  TOP_LEFT_PANE_ID,
  TOP_RIGHT_PANE_ID,
  getVisiblePaneIds,
  useContentStore,
} from "@/state/content-store";

export interface ArtifactRef {
  contentId: string;
  title?: string | null;
  /** ContentNode contentType ("note", "workflow", …). Defaults to note. */
  contentType?: string | null;
}

/**
 * Open an artifact in a pane that is NOT the active one, upgrading a
 * single-pane layout to dual-vertical. The active pane (where the chat
 * lives in full-page mode) is never touched.
 */
export function openArtifactInSplitPane(artifact: ArtifactRef): void {
  const { layoutMode, activePaneId, openContentInPane, setLayoutMode } =
    useContentStore.getState();
  const visible = getVisiblePaneIds(layoutMode);
  let targetPane =
    visible.find((paneId) => paneId !== activePaneId) ?? TOP_RIGHT_PANE_ID;
  if (visible.length <= 1) {
    setLayoutMode("dual-vertical");
    targetPane =
      activePaneId === TOP_RIGHT_PANE_ID ? TOP_LEFT_PANE_ID : TOP_RIGHT_PANE_ID;
  }
  openContentInPane(artifact.contentId, targetPane, {
    title: artifact.title ?? undefined,
    contentType: artifact.contentType ?? undefined,
    pin: true,
  });
}

/**
 * Minimal portaled right-click menu for artifact cards. Portaled to
 * document.body because chat surfaces sit inside transformed ancestors —
 * position:fixed inside them resolves against the ancestor, not the
 * viewport (repo lesson: fixed menus must portal).
 */
export function ArtifactContextMenu({
  position,
  artifact,
  onClose,
}: {
  position: { x: number; y: number };
  artifact: ArtifactRef;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleClick = () => onClose();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("click", handleClick);
    window.addEventListener("contextmenu", handleClick);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("click", handleClick);
      window.removeEventListener("contextmenu", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  // Clamp so the menu never renders off-viewport at screen edges.
  const left = Math.min(position.x, window.innerWidth - 200);
  const top = Math.min(position.y, window.innerHeight - 96);

  const itemClass =
    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-700 dark:text-gray-200 hover:bg-black/[0.05] dark:hover:bg-white/10 transition-colors";

  return createPortal(
    <div
      className="fixed z-[9999] min-w-[180px] overflow-hidden rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-900 py-1 shadow-xl"
      style={{ top, left }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button
        type="button"
        className={itemClass}
        onClick={() => {
          openArtifactInSplitPane(artifact);
          onClose();
        }}
      >
        <PanelRight className="h-3.5 w-3.5 opacity-60" />
        Open in split pane
      </button>
      <button
        type="button"
        className={itemClass}
        onClick={() => {
          useContentStore.getState().setSelectedContentId(artifact.contentId);
          onClose();
        }}
      >
        <ArrowUpRight className="h-3.5 w-3.5 opacity-60" />
        Open here
      </button>
    </div>,
    document.body,
  );
}
