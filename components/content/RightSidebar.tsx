/**
 * Right Sidebar - Metadata and AI Chat (Client Component Wrapper)
 *
 * Manages shared state between header tabs and content display.
 * Follows same pattern as LeftSidebar for architectural consistency.
 */

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RightSidebarHeader } from "./headers/RightSidebarHeader";
import { RightSidebarContent } from "./content/RightSidebarContent";
import { useContentStore } from "@/state/content-store";
import { useBlockStore } from "@/state/block-store";
import { queryTools } from "@/lib/domain/tools";
import type { ContentType } from "@/lib/domain/tools";
import { useLeftPanelViewStore } from "@/state/left-panel-view-store";

export type RightSidebarTab = "backlinks" | "outline" | "tags" | "chat" | "calendar" | "properties";

const TAB_STORAGE_KEY = "rightSidebarActiveTab";

export function RightSidebar() {
  const [activeTab, setActiveTab] = useState<RightSidebarTab>("backlinks");

  // Persist tab selection to localStorage
  useEffect(() => {
    if (typeof window !== "undefined" && activeTab !== "calendar") {
      window.localStorage.setItem(TAB_STORAGE_KEY, activeTab);
    }
  }, [activeTab]);

  // Auto-switch tab when content type changes and current tab is unavailable
  const selectedContentType = useContentStore((state) => state.selectedContentType);
  const selectedBlockId = useBlockStore((s) => s.selectedBlockId);
  const { activeView } = useLeftPanelViewStore();
  const prevBlockIdRef = useRef<string | null>(null);

  // Auto-switch to properties tab when a block is selected (or changes)
  useEffect(() => {
    if (selectedBlockId && selectedBlockId !== prevBlockIdRef.current) {
      // Block selected or changed — switch to properties
      setActiveTab("properties");
    } else if (!selectedBlockId && prevBlockIdRef.current && activeTab === "properties") {
      // Block deselected — switch back to previous tab
      const stored = typeof window !== "undefined"
        ? window.localStorage.getItem(TAB_STORAGE_KEY)
        : null;
      const fallback = (stored as RightSidebarTab) || "backlinks";
      setActiveTab(fallback === "properties" ? "backlinks" : fallback);
    }
    prevBlockIdRef.current = selectedBlockId;
  }, [selectedBlockId, activeTab]);
  const availableTabs = useMemo(
    () =>
      queryTools({
      surface: "sidebar-tab",
      contentType: (selectedContentType as ContentType) ?? undefined,
    })
      .map((t) => t.tabKey)
      .filter(Boolean) as RightSidebarTab[],
    [selectedContentType]
  );

  const effectiveActiveTab =
    activeView === "calendar"
      ? "calendar"
      : availableTabs.includes(activeTab)
        ? activeTab
        : availableTabs[0] || "backlinks";

  return (
    <div className="flex h-full flex-col">
      {/* Header with tab buttons */}
      <RightSidebarHeader activeTab={effectiveActiveTab} onTabChange={setActiveTab} />

      {/* Content based on active tab */}
      <RightSidebarContent activeTab={effectiveActiveTab} />
    </div>
  );
}
