/**
 * Right Sidebar - Metadata and AI Chat (Client Component Wrapper)
 *
 * Manages shared state between header tabs and content display.
 * Follows same pattern as LeftSidebar for architectural consistency.
 */

"use client";

import { useState, useEffect } from "react";
import { RightSidebarHeader } from "./headers/RightSidebarHeader";
import { RightSidebarContent } from "./content/RightSidebarContent";
import { useContentStore } from "@/state/content-store";
import { queryTools } from "@/lib/domain/tools";
import type { ContentType } from "@/lib/domain/tools";

export type RightSidebarTab = "backlinks" | "outline" | "tags" | "chat";

const TAB_STORAGE_KEY = "rightSidebarActiveTab";

export function RightSidebar() {
  // Always start with "backlinks" on server, restore from localStorage on client
  const [activeTab, setActiveTab] = useState<RightSidebarTab>("backlinks");
  const [mounted, setMounted] = useState(false);

  // Restore tab from localStorage after mount
  useEffect(() => {
    const saved = localStorage.getItem(TAB_STORAGE_KEY);
    if (saved && (saved === "backlinks" || saved === "outline" || saved === "tags" || saved === "chat")) {
      setActiveTab(saved as RightSidebarTab);
    }
    setMounted(true);
  }, []);

  // Persist tab selection to localStorage
  useEffect(() => {
    if (mounted) {
      localStorage.setItem(TAB_STORAGE_KEY, activeTab);
    }
  }, [activeTab, mounted]);

  // Auto-switch tab when content type changes and current tab is unavailable
  const selectedContentType = useContentStore((state) => state.selectedContentType);
  useEffect(() => {
    if (!mounted) return;
    const availableTabs = queryTools({
      surface: "sidebar-tab",
      contentType: (selectedContentType as ContentType) ?? undefined,
    })
      .map((t) => t.tabKey)
      .filter(Boolean) as RightSidebarTab[];

    if (availableTabs.length > 0 && !availableTabs.includes(activeTab)) {
      setActiveTab(availableTabs[0]);
    }
  }, [selectedContentType, mounted, activeTab]);

  return (
    <div className="flex h-full flex-col">
      {/* Header with tab buttons */}
      <RightSidebarHeader activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Content based on active tab */}
      <RightSidebarContent activeTab={activeTab} />
    </div>
  );
}
