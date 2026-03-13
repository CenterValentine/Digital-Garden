/**
 * Chat Outline Panel — Sprint 41
 *
 * Displays a navigable outline of a chat conversation.
 * Features:
 * - Role-based icons (user/assistant/tool)
 * - Compact mode: one entry per message (first line + truncation)
 * - Expanded mode: assistant sub-items (headers, lists, images) with dot-and-indent
 * - Click entry to scroll ChatViewer to that message
 * - Granularity toggle between compact/expanded
 */

"use client";

import { useEffect } from "react";
import { useContentStore } from "@/state/content-store";
import { useOutlineStore } from "@/state/outline-store";
import type { ChatOutlineEntry } from "@/lib/domain/ai/chat-outline";

interface ChatOutlinePanelProps {
  /** Callback when an outline entry is clicked — scrolls chat to that message */
  onEntryClick?: (entry: ChatOutlineEntry) => void;
}

export function ChatOutlinePanel({ onEntryClick }: ChatOutlinePanelProps) {
  const selectedContentId = useContentStore((s) => s.selectedContentId);
  const chatOutline = useOutlineStore((s) => s.chatOutline);
  const activeChatEntryId = useOutlineStore((s) => s.activeChatEntryId);
  const setActiveChatEntryId = useOutlineStore((s) => s.setActiveChatEntryId);
  const granularity = useOutlineStore((s) => s.chatOutlineGranularity);
  const toggleGranularity = useOutlineStore(
    (s) => s.toggleChatOutlineGranularity
  );

  // Reset active entry when switching content
  useEffect(() => {
    setActiveChatEntryId(null);
  }, [selectedContentId, setActiveChatEntryId]);

  const handleEntryClick = (entry: ChatOutlineEntry) => {
    setActiveChatEntryId(entry.id);
    onEntryClick?.(entry);
  };

  // Count messages (top-level user + assistant entries)
  const messageCount = chatOutline.filter(
    (e) => e.entryType === "user" || e.entryType === "assistant"
  ).length;

  // Empty state — no content selected
  if (!selectedContentId) {
    return (
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
        <p className="text-sm text-gray-500">No chat selected</p>
        <p className="mt-1 text-xs text-gray-600">
          Select a chat to see its outline
        </p>
      </div>
    );
  }

  // Empty state — no messages
  if (chatOutline.length === 0) {
    return (
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
        <p className="text-sm text-gray-500">No messages yet</p>
        <p className="mt-1 text-xs text-gray-600">
          Start a conversation to see the outline
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
          Chat Outline ({messageCount})
        </h2>
        {/* Granularity toggle */}
        <button
          onClick={toggleGranularity}
          className="rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider transition-colors text-gray-500 hover:text-gray-300 hover:bg-white/5 border border-white/10"
          title={`Switch to ${granularity === "compact" ? "expanded" : "compact"} view`}
        >
          {granularity === "compact" ? "Expand" : "Compact"}
        </button>
      </div>

      {/* Entries list */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="space-y-0.5">
          {chatOutline.map((entry) => (
            <OutlineEntryRow
              key={entry.id}
              entry={entry}
              isActive={activeChatEntryId === entry.id}
              onEntryClick={handleEntryClick}
              activeChatEntryId={activeChatEntryId}
            />
          ))}
        </div>
      </div>

      {/* Footer hint */}
      <div className="shrink-0 border-t border-white/10 px-4 py-2">
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Click to jump to message
        </p>
      </div>
    </div>
  );
}

// ─── Entry Row ────────────────────────────────────────────────

function OutlineEntryRow({
  entry,
  isActive,
  onEntryClick,
  activeChatEntryId,
}: {
  entry: ChatOutlineEntry;
  isActive: boolean;
  onEntryClick: (entry: ChatOutlineEntry) => void;
  activeChatEntryId: string | null;
}) {
  return (
    <>
      {/* Main entry */}
      <button
        onClick={() => onEntryClick(entry)}
        className={`flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm transition-colors ${
          isActive
            ? "bg-gold-primary/20 text-gold-primary font-medium"
            : "text-gray-700 hover:bg-white/10 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
        }`}
        title={entry.text}
      >
        <RoleIcon entryType={entry.entryType} isActive={isActive} />
        <span className="truncate">{entry.text}</span>
      </button>

      {/* Children (expanded mode) */}
      {entry.children?.map((child) => (
        <button
          key={child.id}
          onClick={() => onEntryClick(child)}
          className={`flex w-full items-center gap-2 rounded px-3 py-1.5 text-left text-xs transition-colors ${
            activeChatEntryId === child.id
              ? "bg-gold-primary/20 text-gold-primary font-medium"
              : "text-gray-500 hover:bg-white/10 hover:text-gray-300"
          }`}
          style={{ paddingLeft: `${24 + (child.level ? (child.level - 1) * 12 : 12)}px` }}
          title={child.text}
        >
          <SubItemIndicator entryType={child.entryType} level={child.level} isActive={activeChatEntryId === child.id} />
          <span className="truncate">{child.text}</span>
        </button>
      ))}
    </>
  );
}

// ─── Icons ────────────────────────────────────────────────────

/** Role-based icon for top-level entries */
function RoleIcon({
  entryType,
  isActive,
}: {
  entryType: ChatOutlineEntry["entryType"];
  isActive: boolean;
}) {
  const color = isActive ? "text-gold-primary" : "text-gray-400";

  if (entryType === "user") {
    return (
      <svg
        className={`h-3.5 w-3.5 shrink-0 ${color}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0"
        />
      </svg>
    );
  }

  if (entryType === "assistant") {
    return (
      <svg
        className={`h-3.5 w-3.5 shrink-0 ${color}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
        />
      </svg>
    );
  }

  if (entryType === "tool") {
    return (
      <svg
        className={`h-3.5 w-3.5 shrink-0 ${color}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M11.42 15.17l-5.1 5.1a2.121 2.121 0 01-3-3l5.1-5.1M18.36 8.64l-1.42-1.42a2.121 2.121 0 00-3 0L7.86 13.3"
        />
      </svg>
    );
  }

  return null;
}

/** Dot-and-indent indicator for sub-items (headings, lists, images) */
function SubItemIndicator({
  entryType,
  level,
  isActive,
}: {
  entryType: ChatOutlineEntry["entryType"];
  level?: number;
  isActive: boolean;
}) {
  if (entryType === "heading") {
    const size =
      level === 1 ? "6px" : level === 2 ? "4px" : "3px";
    return (
      <span
        className={`shrink-0 inline-block rounded-full ${
          isActive ? "bg-gold-primary" : "bg-gray-400"
        }`}
        style={{ width: size, height: size }}
      />
    );
  }

  if (entryType === "list") {
    return (
      <span
        className={`shrink-0 inline-block ${
          isActive ? "text-gold-primary" : "text-gray-500"
        }`}
        style={{ fontSize: "8px", lineHeight: 1 }}
      >
        •
      </span>
    );
  }

  if (entryType === "image") {
    return (
      <svg
        className={`h-3 w-3 shrink-0 ${isActive ? "text-gold-primary" : "text-gray-500"}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
        />
      </svg>
    );
  }

  return null;
}
