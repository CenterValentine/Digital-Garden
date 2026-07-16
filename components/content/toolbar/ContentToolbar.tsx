"use client";

/**
 * ContentToolbar
 *
 * Renders tools assigned to the "toolbar" surface in the content header area.
 * Returns null when no toolbar tools are available.
 */

import { BookmarkPlus, Download, Layers, Link2, Share2, Upload, Zap } from "lucide-react";
import { useToolSurface } from "@/lib/domain/tools";
import { useCallback, useEffect, useState, type ComponentType } from "react";
import {
  FLASHCARDS_EXTENSION_ID,
  FLASHCARDS_VIEW_KEY,
} from "@/extensions/flashcards/manifest";
import {
  FLASHCARD_VIEW_SOURCE_EVENT,
  type FlashcardViewSourceEventDetail,
} from "@/extensions/flashcards/events";
import { useIsExtensionEnabled } from "@/lib/extensions/client-registry";
import { useContentStore } from "@/state/content-store";
import { useLeftPanelViewStore } from "@/state/left-panel-view-store";
import { PUBLISHING_EXTENSION_ID } from "@/extensions/publishing/manifest";
import { PublishStatusPill } from "@/extensions/publishing/components/toolbar/PublishStatusPill";
import { ReadAloudButton } from "@/components/content/tts/ReadAloudButton";
import { SPEED_READER_EXTENSION_ID } from "@/extensions/speed-reader/manifest";
import { SendToTabButton } from "@/extensions/browser-bookmarks/components/SendToTabButton";
import { BROWSER_BOOKMARKS_EXTENSION_ID } from "@/extensions/browser-bookmarks/manifest";
import {
  SPEED_READER_OPEN_EVENT,
  type SpeedReaderOpenEventDetail,
} from "@/extensions/speed-reader/events";
import { Sparkles } from "lucide-react";
import { STUDIO_EXTENSION_ID } from "@/extensions/studio/manifest";
import { useRightPanelCollapseStore } from "@/state/right-panel-collapse-store";
import { useRightSidebarStateStore } from "@/state/right-sidebar-state-store";

/** Content types whose own text the toolbar "Listen" can narrate. */
const READ_ALOUD_CONTENT_TYPES = new Set(["note", "file", "html", "code"]);

/** Map iconName strings to lucide-react components */
const ICON_MAP: Record<string, ComponentType<{ className?: string }>> = {
  BookmarkPlus,
  Download,
  Layers,
  Link2,
  Share2,
  Upload,
};

interface ContentToolbarProps {
  /**
   * The content this toolbar represents. In a multi-pane layout each pane
   * renders its own toolbar, so it must reflect THAT pane's content — not the
   * globally-active selection. Falls back to the global selection when omitted
   * (single-surface mounts). Passing the pane's id also stops an adjacent
   * pane's activity from reflowing this toolbar (flashcard/publish width churn).
   */
  contentId?: string | null;
}

export function ContentToolbar({ contentId: contentIdProp }: ContentToolbarProps = {}) {
  const toolSurface = useToolSurface();
  const globalSelectedContentId = useContentStore((state) => state.selectedContentId);
  const selectedContentId =
    contentIdProp !== undefined ? contentIdProp : globalSelectedContentId;
  const selectedTitle = useContentStore((state) =>
    selectedContentId
      ? state.tabs[`tab:${selectedContentId}`]?.title ?? null
      : null
  );
  const setActiveView = useLeftPanelViewStore((state) => state.setActiveView);
  const flashcardsEnabled = useIsExtensionEnabled(FLASHCARDS_EXTENSION_ID);
  const publishingEnabled = useIsExtensionEnabled(PUBLISHING_EXTENSION_ID);
  const speedReaderEnabled = useIsExtensionEnabled(SPEED_READER_EXTENSION_ID);
  const [sourceFlashcardCount, setSourceFlashcardCount] = useState<{
    sourceContentId: string;
    count: number;
  } | null>(null);

  const tools = toolSurface?.getToolsForSurface("toolbar") ?? [];
  const sourceContentId =
    selectedContentId &&
    !selectedContentId.startsWith("temp-") &&
    !selectedContentId.startsWith("person:")
      ? selectedContentId
      : null;
  // "Listen" reads THE CONTENT's own text, by type (note text, or a file's
  // extracted document text) — not the sidecar note. Shown only for content
  // types that carry narratable text.
  const activeContentType = useContentStore((state) => state.selectedContentType);
  const canReadAloud =
    Boolean(sourceContentId) &&
    activeContentType != null &&
    READ_ALOUD_CONTENT_TYPES.has(activeContentType);

  useEffect(() => {
    if (!flashcardsEnabled || !sourceContentId) {
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({ sourceContentId });
    fetch(`/api/flashcards/count?${params.toString()}`, {
      credentials: "include",
      signal: controller.signal,
    })
      .then((response) => response.json())
      .then((result) => {
        if (result?.success) {
          setSourceFlashcardCount({
            sourceContentId,
            count: Number(result.data?.count ?? 0),
          });
        }
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setSourceFlashcardCount({ sourceContentId, count: 0 });
      });

    return () => controller.abort();
  }, [flashcardsEnabled, sourceContentId]);

  const visibleSourceFlashcardCount =
    flashcardsEnabled &&
    sourceContentId &&
    sourceFlashcardCount?.sourceContentId === sourceContentId
      ? sourceFlashcardCount.count
      : 0;

  const openSourceFlashcards = useCallback(() => {
    if (!sourceContentId) return;
    setActiveView(FLASHCARDS_VIEW_KEY);
    window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent<FlashcardViewSourceEventDetail>(
          FLASHCARD_VIEW_SOURCE_EVENT,
          {
            detail: {
              sourceContentId,
              sourceTitle: selectedTitle,
            },
          }
        )
      );
    }, 50);
  }, [selectedTitle, setActiveView, sourceContentId]);

  const showPublishPill = publishingEnabled && sourceContentId;
  const showSpeedRead = speedReaderEnabled && !!sourceContentId;
  const browserBookmarksEnabled = useIsExtensionEnabled(BROWSER_BOOKMARKS_EXTENSION_ID);
  const showSendToTab = browserBookmarksEnabled && !!sourceContentId;

  // Folder Studio shortcut — folders only. Expands the right sidebar if
  // collapsed and lands on the Studio tab (speed-reader button pattern).
  const studioEnabled = useIsExtensionEnabled(STUDIO_EXTENSION_ID);
  const setRightPanelCollapsed = useRightPanelCollapseStore((s) => s.setCollapsed);
  const setRightSidebarTab = useRightSidebarStateStore((s) => s.setActiveTab);
  const showStudio =
    studioEnabled && !!sourceContentId && activeContentType === "folder";
  const openStudio = useCallback(() => {
    if (!sourceContentId) return;
    setRightPanelCollapsed(false);
    setRightSidebarTab(sourceContentId, "studio");
  }, [sourceContentId, setRightPanelCollapsed, setRightSidebarTab]);

  const openSpeedReader = useCallback(() => {
    if (!sourceContentId) return;
    window.dispatchEvent(
      new CustomEvent<SpeedReaderOpenEventDetail>(SPEED_READER_OPEN_EVENT, {
        detail: { sourceContentId, sourceTitle: selectedTitle },
      })
    );
  }, [selectedTitle, sourceContentId]);

  if (
    tools.length === 0 &&
    visibleSourceFlashcardCount === 0 &&
    !showPublishPill &&
    !canReadAloud &&
    !showSpeedRead &&
    !showSendToTab &&
    !showStudio
  ) {
    return null;
  }

  return (
    <div
      className="flex min-h-11 shrink-0 items-center gap-1 overflow-x-auto px-3 py-1.5"
      role="toolbar"
      aria-label="Content actions"
    >
      {showPublishPill && (
        <PublishStatusPill contentId={sourceContentId} />
      )}
      {canReadAloud && (
        <ReadAloudButton
          contentId={sourceContentId}
          contentType={activeContentType}
          source="content"
          variant="icon"
        />
      )}
      {/* Tools with order < 70: copy-link, share, save-as-template */}
      {tools.filter((t) => t.definition.order < 70).map((tool) => {
        const Icon = ICON_MAP[tool.definition.iconName];
        const isIconOnly = tool.definition.iconOnly ?? false;
        return (
          <button
            key={tool.definition.id}
            onClick={tool.execute}
            disabled={tool.isDisabled}
            className={`flex shrink-0 items-center gap-1.5 rounded-md ${
              isIconOnly ? "px-1.5 py-1.5" : "px-2.5 py-1.5"
            } text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50`}
            title={tool.definition.label}
            type="button"
          >
            {Icon && <Icon className="h-4 w-4" />}
            {!isIconOnly && <span className="whitespace-nowrap">{tool.definition.label}</span>}
          </button>
        );
      })}
      {/* Folder Studio — folders only; opens the Studio sidebar tab */}
      {showStudio && (
        <button
          onClick={openStudio}
          className="flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title="Open Folder Studio"
          type="button"
        >
          <Sparkles className="h-4 w-4" />
        </button>
      )}
      {/* Speed Read — positioned before import/export (orders 75+) */}
      {showSpeedRead && (
        <button
          onClick={openSpeedReader}
          className="flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title="Speed Read"
          type="button"
        >
          <Zap className="h-4 w-4" />
        </button>
      )}
      {showSendToTab && (
        <SendToTabButton contentId={sourceContentId} contentKind="note" />
      )}
      {/* Tools with order >= 70: import, export */}
      {tools.filter((t) => t.definition.order >= 70).map((tool) => {
        const Icon = ICON_MAP[tool.definition.iconName];
        const isIconOnly = tool.definition.iconOnly ?? false;
        return (
          <button
            key={tool.definition.id}
            onClick={tool.execute}
            disabled={tool.isDisabled}
            className={`flex shrink-0 items-center gap-1.5 rounded-md ${
              isIconOnly ? "px-1.5 py-1.5" : "px-2.5 py-1.5"
            } text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50`}
            title={tool.definition.label}
            type="button"
          >
            {Icon && <Icon className="h-4 w-4" />}
            {!isIconOnly && <span className="whitespace-nowrap">{tool.definition.label}</span>}
          </button>
        );
      })}
      {visibleSourceFlashcardCount > 0 ? (
        <button
          onClick={openSourceFlashcards}
          className="flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title={`View ${visibleSourceFlashcardCount} attached flashcard${
            visibleSourceFlashcardCount === 1 ? "" : "s"
          }`}
          type="button"
        >
          <Layers className="h-4 w-4" />
          <span className="whitespace-nowrap">View Flashcards</span>
        </button>
      ) : null}
    </div>
  );
}
