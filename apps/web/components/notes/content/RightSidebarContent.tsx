/**
 * Right Sidebar Content (Client Component)
 *
 * Shows outline, backlinks, and AI chat based on active tab.
 * State is managed by parent RightSidebar component.
 */

"use client";

import { BacklinksPanel } from "../BacklinksPanel";
import { OutlinePanel } from "../OutlinePanel";
import { TagsPanel } from "../TagsPanel";
import { useOutlineStore } from "@/stores/outline-store";
import type { RightSidebarTab } from "../RightSidebar";

interface RightSidebarContentProps {
  activeTab: RightSidebarTab;
}

export function RightSidebarContent({ activeTab }: RightSidebarContentProps) {
  const outline = useOutlineStore((state) => state.outline);

  // Handle outline heading click - scroll editor to that heading
  const handleHeadingClick = (heading: any) => {
    // TODO: Implement scroll-to-heading functionality
    console.log("[RightSidebarContent] Scroll to heading:", heading.text);
  };

  return (
    <div className="flex-1 overflow-hidden">
      {activeTab === "backlinks" && <BacklinksPanel />}
      {activeTab === "outline" && (
        <OutlinePanel outline={outline} onHeadingClick={handleHeadingClick} />
      )}
      {activeTab === "tags" && <TagsPanel />}
      {activeTab === "chat" && (
        <div className="flex h-full flex-col items-center justify-center p-8 text-center">
          <svg
            className="mb-3 h-12 w-12 text-gray-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
          <p className="text-sm text-gray-500">AI Chat</p>
          <p className="mt-1 text-xs text-gray-600">Coming soon</p>
        </div>
      )}
    </div>
  );
}

