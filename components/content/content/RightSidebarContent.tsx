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
import { ChatPanel } from "../ai/ChatPanel";
import { useOutlineStore } from "@/state/outline-store";
import type { RightSidebarTab } from "../RightSidebar";
import type { OutlineHeading } from "@/lib/domain/content/outline-extractor";

interface RightSidebarContentProps {
  activeTab: RightSidebarTab;
}

export function RightSidebarContent({ activeTab }: RightSidebarContentProps) {
  const outline = useOutlineStore((state) => state.outline);
  const setActiveHeadingId = useOutlineStore((state) => state.setActiveHeadingId);

  // Handle outline heading click — dispatches a CustomEvent that MarkdownEditor listens for
  const handleHeadingClick = (heading: OutlineHeading) => {
    setActiveHeadingId(heading.id);
    window.dispatchEvent(
      new CustomEvent("scroll-to-heading", {
        detail: { position: heading.position, id: heading.id, text: heading.text, level: heading.level },
      })
    );
  };

  return (
    <div className="flex-1 overflow-hidden">
      {activeTab === "backlinks" && <BacklinksPanel />}
      {activeTab === "outline" && (
        <OutlinePanel outline={outline} onHeadingClick={handleHeadingClick} />
      )}
      {activeTab === "tags" && <TagsPanel />}
      {activeTab === "chat" && <ChatPanel />}
    </div>
  );
}

