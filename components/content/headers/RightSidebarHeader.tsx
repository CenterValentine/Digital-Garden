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
import { useBlockStore } from "@/state/block-store";
import { queryTools } from "@/lib/domain/tools";
import type { ToolDefinition, ContentType } from "@/lib/domain/tools";
import type { RightSidebarTab } from "@/state/right-sidebar-state-store";

/** Inline SVG paths keyed by tabKey (project pattern: inline SVG in headers) */
const TAB_SVG_PATHS: Record<string, string> = {
  backlinks:
    "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1",
  outline: "M4 6h16M4 12h16M4 18h7",
  tags: "M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z",
  chat: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z",
  properties: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
};

/** Tab titles keyed by tabKey */
const TAB_TITLES: Record<string, string> = {
  backlinks: "Backlinks",
  outline: "Outline",
  tags: "Tags",
  chat: "AI Chat",
  properties: "Block Properties",
};

interface RightSidebarHeaderProps {
  activeTab: RightSidebarTab;
  onTabChange: (tab: RightSidebarTab) => void;
}

export function RightSidebarHeader({ activeTab, onTabChange }: RightSidebarHeaderProps) {
  const { toggleCollapsed } = useRightPanelCollapseStore();
  const selectedContentType = useContentStore((state) => state.selectedContentType);
  const selectedBlockId = useBlockStore((s) => s.selectedBlockId);

  // Get visible tabs from registry, filtered by current content type
  const registryTabs = queryTools({
    surface: "sidebar-tab",
    contentType: (selectedContentType as ContentType) ?? undefined,
  });

  // Inject properties tab when a block is selected
  const tabs = selectedBlockId
    ? [
        ...registryTabs,
        { id: "properties-tab", label: "Block Properties", tabKey: "properties" } as ToolDefinition,
      ]
    : registryTabs;

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
