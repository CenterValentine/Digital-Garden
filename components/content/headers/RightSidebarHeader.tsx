/**
 * Right Sidebar Header (Client Component)
 *
 * Tab navigation for switching between sidebar panels.
 * Reads tab definitions from the Tool Surfaces registry, filtered
 * by the current content type. Uses inline SVG for consistency
 * with LeftSidebarHeader pattern.
 *
 * Includes collapse toggle button for hiding/showing the panel.
 */

"use client";

import { PanelRightClose } from "lucide-react";
import { useRightPanelCollapseStore } from "@/state/right-panel-collapse-store";
import { useContentStore } from "@/state/content-store";
import { queryTools } from "@/lib/domain/tools";
import type { ToolDefinition, ContentType } from "@/lib/domain/tools";
import type { RightSidebarTab } from "../RightSidebar";

/** Inline SVG paths keyed by tabKey (project pattern: inline SVG in headers) */
const TAB_SVG_PATHS: Record<string, string> = {
  backlinks:
    "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1",
  outline: "M4 6h16M4 12h16M4 18h7",
  tags: "M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z",
  chat: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z",
};

/** Tab titles keyed by tabKey */
const TAB_TITLES: Record<string, string> = {
  backlinks: "Backlinks",
  outline: "Outline",
  tags: "Tags",
  chat: "AI Chat",
};

interface RightSidebarHeaderProps {
  activeTab: RightSidebarTab;
  onTabChange: (tab: RightSidebarTab) => void;
}

export function RightSidebarHeader({ activeTab, onTabChange }: RightSidebarHeaderProps) {
  const { toggleCollapsed } = useRightPanelCollapseStore();
  const selectedContentType = useContentStore((state) => state.selectedContentType);

  // Get visible tabs from registry, filtered by current content type
  const tabs = queryTools({
    surface: "sidebar-tab",
    contentType: (selectedContentType as ContentType) ?? undefined,
  });

  return (
    <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 px-4">
      <div className="flex flex-1 items-center justify-around">
        {tabs.map((tool: ToolDefinition) => {
          const tabKey = tool.tabKey as RightSidebarTab | undefined;
          if (!tabKey) return null;

          const svgPath = TAB_SVG_PATHS[tabKey];
          if (!svgPath) return null;

          return (
            <button
              key={tool.id}
              onClick={() => onTabChange(tabKey)}
              className={`flex flex-1 items-center justify-center px-4 py-3 transition-colors ${
                activeTab === tabKey
                  ? "border-b-2 border-gold-primary text-gold-primary"
                  : "text-gray-400 hover:text-gray-300"
              }`}
              title={TAB_TITLES[tabKey] ?? tool.label}
              type="button"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d={svgPath}
                />
              </svg>
            </button>
          );
        })}
      </div>

      {/* Panel collapse toggle */}
      <button
        onClick={toggleCollapsed}
        className="rounded p-1 transition-colors hover:bg-white/10 text-gray-400 hover:text-gold-primary"
        title="Collapse sidebar (Cmd+.)"
        type="button"
      >
        <PanelRightClose className="h-4 w-4" />
      </button>
    </div>
  );
}
