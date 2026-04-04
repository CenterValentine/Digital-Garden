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
import { useContentStore } from "@/state/content-store";
import { useBlockStore } from "@/state/block-store";
import { queryTools } from "@/lib/domain/tools";
import type { ContentType } from "@/lib/domain/tools";
import {
  resolveRightSidebarTab,
  useRightSidebarStateStore,
} from "@/state/right-sidebar-state-store";
import type { RightSidebarTab } from "@/state/right-sidebar-state-store";

export function RightSidebar() {
  const selectedContentId = useContentStore((state) => state.selectedContentId);
  const selectedContentType = useContentStore((state) => state.selectedContentType);
  const selectedBlockId = useBlockStore((s) => s.selectedBlockId);
  const prevBlockIdRef = useRef<string | null>(null);

  const savedTab = useRightSidebarStateStore((state) =>
    selectedContentId
      ? state.activeTabByContentId[selectedContentId] ?? null
      : null
  );
  const setActiveTab = useRightSidebarStateStore((state) => state.setActiveTab);

  const availableTabs = useMemo(
    () =>
      queryTools({
        surface: "sidebar-tab",
        contentType: (selectedContentType as ContentType) ?? undefined,
      })
        .map((tool) => tool.tabKey)
        .filter(Boolean) as RightSidebarTab[],
    [selectedContentType]
  );

  const activeTab = useMemo(
    () => resolveRightSidebarTab(savedTab, availableTabs),
    [availableTabs, savedTab]
  );

  useEffect(() => {
    if (!selectedContentId || savedTab === activeTab) return;
    setActiveTab(selectedContentId, activeTab);
  }, [activeTab, savedTab, selectedContentId, setActiveTab]);

  // Auto-switch to properties tab when a block is selected
  useEffect(() => {
    if (!selectedContentId) return;
    if (selectedBlockId && selectedBlockId !== prevBlockIdRef.current) {
      setActiveTab(selectedContentId, "properties");
    } else if (!selectedBlockId && prevBlockIdRef.current && savedTab === "properties") {
      setActiveTab(selectedContentId, "backlinks");
    }
    prevBlockIdRef.current = selectedBlockId;
  }, [selectedBlockId, selectedContentId, savedTab, setActiveTab]);

  const handleTabChange = (tab: RightSidebarTab) => {
    if (!selectedContentId) return;
    setActiveTab(selectedContentId, tab);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header with tab buttons */}
      <RightSidebarHeader activeTab={activeTab} onTabChange={handleTabChange} />

      {/* Content based on active tab */}
      <RightSidebarContent activeTab={activeTab} />
    </div>
  );
}
