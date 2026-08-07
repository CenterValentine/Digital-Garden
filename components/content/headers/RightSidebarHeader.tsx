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
import { useLeftPanelViewStore } from "@/state/left-panel-view-store";
import { queryTools } from "@/lib/domain/tools";
import type { ToolDefinition, ContentType } from "@/lib/domain/tools";
import { getExtensionManifestForView } from "@/lib/extensions";
import { useIsExtensionEnabled } from "@/lib/extensions/client-registry";
import {
  STUDIO_EXTENSION_ID,
  STUDIO_TAB_KEY,
} from "@/extensions/studio/manifest";
import type { RightSidebarTab } from "@/state/right-sidebar-state-store";

/** Inline SVG paths keyed by tabKey (project pattern: inline SVG in headers) */
const TAB_SVG_PATHS: Record<string, string> = {
  backlinks:
    "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1",
  outline: "M4 6h16M4 12h16M4 18h7",
  tags: "M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z",
  chat: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z",
  properties: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
  extension:
    "M8 2v4M16 2v4M3 10h18M5 6h14a2 2 0 012 2v11a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z",
  publish:
    "M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9",
  // Desk lamp (lucide LampDesk) — studio's study-room identity; the old
  // sparkles glyph was overloaded across AI surfaces.
  studio:
    "M14 5l-3 3l2 7l8-8l-7-2Z M14 5l-3 3l-3-3l3-3l3 3Z M9.5 6.5L4 12l3 6 M3 22v-2c0-1.1.9-2 2-2h10a2 2 0 0 1 2 2v2H3Z",
  context:
    "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
};

/** Tab titles keyed by tabKey */
const TAB_TITLES: Record<string, string> = {
  backlinks: "Links",
  outline: "Outline",
  tags: "Tags",
  chat: "AI Chat",
  properties: "Block Properties",
  extension: "Extension",
  publish: "Publish",
  studio: "Studio",
  context: "Context",
};

interface RightSidebarHeaderProps {
  activeTab: RightSidebarTab;
  onTabChange: (tab: RightSidebarTab) => void;
  /**
   * Sideview tabs are non-interactive until the active sidepanel has loaded
   * (spec §3.4) — prevents the "clickable but no-op / wrong tab" window.
   */
  disabled?: boolean;
}

export function RightSidebarHeader({ activeTab, onTabChange, disabled = false }: RightSidebarHeaderProps) {
  const { toggleCollapsed } = useRightPanelCollapseStore();
  const selectedContentType = useContentStore((state) => state.selectedContentType);
  const selectedBlockId = useBlockStore((s) => s.selectedBlockId);
  const activeView = useLeftPanelViewStore((state) => state.activeView);
  const extensionManifest = getExtensionManifestForView(activeView);

  const extensionTool = extensionManifest?.surfaces.includes("right-sidebar")
    ? ({
        id: `${extensionManifest.id}-right-sidebar`,
        label: extensionManifest.label,
        tabKey: "extension",
      } as ToolDefinition)
    : null;

  const studioEnabled = useIsExtensionEnabled(STUDIO_EXTENSION_ID);

  // Get visible tabs from registry, filtered by current content type.
  // The Studio tab disappears when the extension is disabled (registry-
  // filter rule — same mechanism ContentToolbar uses for speed-reader).
  // Context stays: its links/tags sub-tabs are core surfaces.
  const registryTabs = queryTools({
    surface: "sidebar-tab",
    contentType: (selectedContentType as ContentType) ?? undefined,
  }).filter((tool) => studioEnabled || tool.tabKey !== STUDIO_TAB_KEY);

  const tabs = [...registryTabs];
  if (extensionTool) {
    tabs.push(extensionTool);
  }
  if (selectedBlockId) {
    tabs.push({
      id: "properties-tab",
      label: "Block Properties",
      tabKey: "properties",
    } as ToolDefinition);
  }

  const uniqueTabs = tabs.filter((tool, index, list) => {
    const tabKey = tool.tabKey as RightSidebarTab | undefined;
    return Boolean(tabKey) && list.findIndex((candidate) => candidate.tabKey === tabKey) === index;
  });

  return (
    <div className="dg-rightsidebar-tabs flex h-12 shrink-0 items-center border-b border-white/10 px-2 gap-1">
      <div className="scrollbar-hide flex min-w-0 flex-1 items-center justify-around overflow-x-auto">
        {uniqueTabs.map((tool: ToolDefinition) => {
          const tabKey = tool.tabKey as RightSidebarTab | undefined;
          if (!tabKey) return null;

          const svgPath = TAB_SVG_PATHS[tabKey];
          if (!svgPath) return null;

          return (
            <button
              key={tool.id}
              onClick={() => onTabChange(tabKey)}
              disabled={disabled}
              className={`flex flex-1 items-center justify-center px-4 py-3 transition-colors ${
                disabled ? "cursor-default opacity-40" : ""
              } ${
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

      {/* Panel collapse toggle — must never be clipped */}
      <button
        onClick={toggleCollapsed}
        className="shrink-0 rounded p-1 transition-colors hover:bg-black/[0.04] dark:hover:bg-white/10 text-gray-500 dark:text-gray-400 hover:text-gold-primary"
        title="Collapse sidebar (Cmd+.)"
        type="button"
      >
        <PanelRightClose className="h-4 w-4" />
      </button>
    </div>
  );
}
