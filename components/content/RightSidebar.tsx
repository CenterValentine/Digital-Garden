/**
 * Right Sidebar - Metadata and AI Chat (Client Component Wrapper)
 *
 * Manages shared state between header tabs and content display.
 * Follows same pattern as LeftSidebar for architectural consistency.
 */

"use client";

import { useEffect, useMemo, useRef } from "react";
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
  const prevBlockIdRef = useRef<string | null>(null);
  const extensionManifest = getExtensionManifestForView(activeView);

  const { rightSidebarHydrated: storeHydrated, rightPanelReady } =
    useContentReadiness();

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

  const activeTab = useMemo(() => {
    if (!savedTab && selectedBlockId) {
      return resolveRightSidebarTab("properties", availableTabs);
    }
    if (!savedTab && extensionManifest?.surfaces.includes("right-sidebar")) {
      return resolveRightSidebarTab("extension", availableTabs);
    }
    return resolveRightSidebarTab(savedTab, availableTabs);
  }, [availableTabs, extensionManifest, savedTab, selectedBlockId]);

  // Auto-correct effect: if the resolver chose a tab different from
  // the persisted savedTab, write the corrected value back. Gated on
  // store hydration so we don't overwrite the user's saved tab with a
  // fallback computed against an empty/transient availableTabs list.
  // Additionally requires a non-null selectedContentType — the
  // resolver's fallback choice isn't trustworthy without it.
  useEffect(() => {
    if (!storeHydrated) return;
    if (activeTab === "extension") return;
    if (!selectedContentId || !selectedContentType || savedTab === activeTab) return;
    setActiveTab(selectedContentId, activeTab);
  }, [
    storeHydrated,
    activeTab,
    savedTab,
    selectedContentId,
    selectedContentType,
    setActiveTab,
  ]);

  // Auto-switch to properties tab when a block is selected. Two
  // guards to prevent stale block selections from clobbering the
  // saved tab on initial mount:
  //   1. storeHydrated — don't write before the persisted tab loads.
  //   2. prevBlockIdRef is seeded with the initial selectedBlockId on
  //      first run AFTER hydration, so we only treat *changes* as
  //      user-initiated selections. A block that's selected at mount
  //      time (from some legacy / cached path) won't trigger a write.
  const hasSeededBlockRef = useRef(false);
  useEffect(() => {
    if (!storeHydrated) return;
    if (!selectedContentId) return;

    // First post-hydration run: just record the initial state without
    // writing. Any selectedBlockId at this point came from a non-user
    // path (editor mount, stale extension state, etc.) and should not
    // be treated as a "user clicked a block" event.
    if (!hasSeededBlockRef.current) {
      prevBlockIdRef.current = selectedBlockId;
      hasSeededBlockRef.current = true;
      return;
    }

    if (selectedBlockId && selectedBlockId !== prevBlockIdRef.current) {
      setActiveTab(selectedContentId, "properties");
    } else if (!selectedBlockId && prevBlockIdRef.current && savedTab === "properties") {
      setActiveTab(selectedContentId, "backlinks");
    }
    prevBlockIdRef.current = selectedBlockId;
  }, [storeHydrated, selectedBlockId, selectedContentId, savedTab, setActiveTab]);

  const handleTabChange = (tab: RightSidebarTab) => {
    if (tab === "extension") return;
    if (!selectedContentId) return;
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
