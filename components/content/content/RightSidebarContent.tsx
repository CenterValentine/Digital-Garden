/**
 * Right Sidebar Content (Client Component)
 *
 * Shows outline, backlinks, and AI chat based on active tab.
 * State is managed by parent RightSidebar component.
 *
 * Sprint 41: Outline tab now renders ChatOutlinePanel for chat content types.
 */

"use client";

import { BacklinksPanel } from "../BacklinksPanel";
import { OutlinePanel } from "../OutlinePanel";
import { ChatOutlinePanel } from "../ChatOutlinePanel";
import { TagsPanel } from "../TagsPanel";
import { ChatPanel } from "../ai/ChatPanel";
import { useOutlineStore } from "@/state/outline-store";
import { useContentStore } from "@/state/content-store";
import type { OutlineHeading } from "@/lib/domain/content/outline-extractor";
import type { ChatOutlineEntry } from "@/lib/domain/ai/chat-outline";
import type { RightSidebarTab } from "@/state/right-sidebar-state-store";

interface RightSidebarContentProps {
  activeTab: RightSidebarTab;
}

export function RightSidebarContent({ activeTab }: RightSidebarContentProps) {
  const selectedContentId = useContentStore((s) => s.selectedContentId);
  const outline = useOutlineStore((state) =>
    state.getViewState(selectedContentId).outline
  );
  const setActiveHeadingId = useOutlineStore((state) => state.setActiveHeadingId);
  const selectedContentType = useContentStore((s) => s.selectedContentType);

  // Handle outline heading click — dispatches a CustomEvent that MarkdownEditor listens for
  const handleHeadingClick = (heading: OutlineHeading) => {
    if (!selectedContentId) return;
    setActiveHeadingId(selectedContentId, heading.id);
    window.dispatchEvent(
      new CustomEvent("scroll-to-heading", {
        detail: { position: heading.position, id: heading.id, text: heading.text, level: heading.level },
      })
    );
  };

  // Handle chat outline entry click — dispatches a CustomEvent that ChatViewer listens for
  const handleChatEntryClick = (entry: ChatOutlineEntry) => {
    window.dispatchEvent(
      new CustomEvent("scroll-to-chat-message", {
        detail: { messageIndex: entry.messageIndex, entryId: entry.id },
      })
    );
  };

  const isChat = selectedContentType === "chat";

  return (
    <div className="flex-1 overflow-hidden">
      {activeTab === "backlinks" && (
        <BacklinksPanel contentId={selectedContentId} />
      )}
      {activeTab === "outline" &&
        (isChat ? (
          <ChatOutlinePanel
            contentId={selectedContentId}
            onEntryClick={handleChatEntryClick}
          />
        ) : (
          <OutlinePanel
            contentId={selectedContentId}
            outline={outline}
            onHeadingClick={handleHeadingClick}
          />
        ))}
      {activeTab === "tags" && <TagsPanel contentId={selectedContentId} />}
      {activeTab === "chat" && <ChatPanel contentId={selectedContentId} />}
    </div>
  );
}
