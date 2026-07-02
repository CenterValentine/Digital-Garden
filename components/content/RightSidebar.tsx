/**
 * Right Sidebar - Metadata and AI Chat (Client Component Wrapper)
 *
 * Manages shared state between header tabs and content display.
 * Follows same pattern as LeftSidebar for architectural consistency.
 */

"use client";

import { useMemo, useState } from "react";
import { RightSidebarHeader } from "./headers/RightSidebarHeader";
import { RightSidebarContent } from "./content/RightSidebarContent";
import { useContentReadiness } from "@/lib/features/content/load-readiness";
import { useContentStore } from "@/state/content-store";
import { useBlockStore } from "@/state/block-store";
import { queryTools } from "@/lib/domain/tools";
import type { ContentType } from "@/lib/domain/tools";
import { useLeftPanelViewStore } from "@/state/left-panel-view-store";
import { getExtensionManifestForView } from "@/lib/extensions";
import {
  resolveRightSidebarTab,
  useRightSidebarStateStore,
} from "@/state/right-sidebar-state-store";
import type { RightSidebarTab } from "@/state/right-sidebar-state-store";

export function RightSidebar() {
  const selectedContentId = useContentStore((state) => state.selectedContentId);
  const selectedContentType = useContentStore((state) => state.selectedContentType);
  const selectedBlockId = useBlockStore((s) => s.selectedBlockId);
  const activeView = useLeftPanelViewStore((state) => state.activeView);
  const extensionManifest = getExtensionManifestForView(activeView);

  // The block a user explicitly dismissed the Properties override for (by
  // clicking another tab while it was selected). Lets an explicit tab choice
  // win over the live block→Properties override without persisting anything.
  const [dismissedBlockId, setDismissedBlockId] = useState<string | null>(null);

  const { rightPanelReady } = useContentReadiness();

  const savedTab = useRightSidebarStateStore((state) =>
    selectedContentId
      ? state.activeTabByContentId[selectedContentId] ?? null
      : null
  );
  const setActiveTab = useRightSidebarStateStore((state) => state.setActiveTab);

  const availableTabs = useMemo(() => {
    const tabs = queryTools({
      surface: "sidebar-tab",
      contentType: (selectedContentType as ContentType) ?? undefined,
    })
      .map((tool) => tool.tabKey)
      .filter(Boolean) as RightSidebarTab[];

    // Properties tab is available when a block is selected (injected by RightSidebarHeader)
    if (selectedBlockId && !tabs.includes("properties")) {
      tabs.push("properties");
    }

    return tabs;
  }, [selectedContentType, selectedBlockId]);

  // The saved tab is sacred: it ONLY changes via an explicit user action
  // (handleTabChange). Selecting a block shows the Properties panel as a LIVE,
  // never-persisted override — so an editor mount flickering a block selection
  // can no longer overwrite the user's saved tab (e.g. chat) and "stick" on a
  // fallback. Everything here resolves live; nothing writes to the store.
  const activeTab = useMemo(() => {
    if (
      selectedBlockId &&
      selectedBlockId !== dismissedBlockId &&
      availableTabs.includes("properties")
    ) {
      return "properties";
    }
    if (!savedTab && extensionManifest?.surfaces.includes("right-sidebar")) {
      return resolveRightSidebarTab("extension", availableTabs);
    }
    return resolveRightSidebarTab(savedTab, availableTabs);
  }, [availableTabs, dismissedBlockId, extensionManifest, savedTab, selectedBlockId]);

  const handleTabChange = (tab: RightSidebarTab) => {
    if (tab === "extension") return;
    if (!selectedContentId) return;
    // If the user picks a tab while a block is selected, their choice wins over
    // the live Properties override (until they select a different block).
    if (selectedBlockId) setDismissedBlockId(selectedBlockId);
    setActiveTab(selectedContentId, tab);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header with tab buttons — non-interactive until the panel is ready
          so the user never clicks a tab that resolves to the wrong view. */}
      <RightSidebarHeader
        activeTab={activeTab}
        onTabChange={handleTabChange}
        disabled={!rightPanelReady}
      />

      {/* Preference loader until the persisted last-seen view is known
          (spec §3.4) — never render a guessed default that later corrects. */}
      {rightPanelReady ? (
        <RightSidebarContent activeTab={activeTab} />
      ) : (
        <RightSidebarLoader />
      )}
    </div>
  );
}

/** Skeleton shown in the right panel until its saved view resolves. */
function RightSidebarLoader() {
  return (
    <div className="flex-1 space-y-3 p-4" aria-busy="true" aria-label="Loading panel">
      <div className="h-4 w-2/3 animate-pulse rounded bg-white/5" />
      <div className="h-4 w-1/2 animate-pulse rounded bg-white/5" />
      <div className="h-24 w-full animate-pulse rounded bg-white/5" />
      <div className="h-4 w-3/4 animate-pulse rounded bg-white/5" />
    </div>
  );
}
