"use client";

/**
 * ContentToolbar
 *
 * Renders tools assigned to the "toolbar" surface in the content header area.
 * Returns null when no toolbar tools are available.
 */

import { BookmarkPlus, Download, Layers, Link2, Share2, Upload } from "lucide-react";
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
import { GlassyScroll } from "@/components/GlassyScroll";

/** Map iconName strings to lucide-react components */
const ICON_MAP: Record<string, ComponentType<{ className?: string }>> = {
  BookmarkPlus,
  Download,
  Layers,
  Link2,
  Share2,
  Upload,
};

export function ContentToolbar() {
  const toolSurface = useToolSurface();
  const selectedContentId = useContentStore((state) => state.selectedContentId);
  const selectedTitle = useContentStore((state) => {
    if (!state.selectedContentId) return null;
    return state.tabs[`tab:${state.selectedContentId}`]?.title ?? null;
  });
  const setActiveView = useLeftPanelViewStore((state) => state.setActiveView);
  const flashcardsEnabled = useIsExtensionEnabled(FLASHCARDS_EXTENSION_ID);
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

  if (tools.length === 0 && visibleSourceFlashcardCount === 0) {
    return null;
  }

  return (
    <GlassyScroll axis="x" className="min-h-11 shrink-0 px-3 py-1.5">
      <div
        className="flex items-center gap-1"
        role="toolbar"
        aria-label="Content actions"
      >
      {tools.map((tool) => {
        const Icon = ICON_MAP[tool.definition.iconName];
        return (
          <button
            key={tool.definition.id}
            onClick={tool.execute}
            disabled={tool.isDisabled}
            className="flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            title={tool.definition.label}
            type="button"
          >
            {Icon && <Icon className="h-4 w-4" />}
            <span className="whitespace-nowrap">{tool.definition.label}</span>
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
    </GlassyScroll>
  );
}
