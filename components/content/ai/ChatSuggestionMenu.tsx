/**
 * ChatSuggestionMenu
 *
 * Shared dropdown for @ file mentions and / tool commands.
 * Renders above the textarea input, keyboard-navigable.
 * Used by ChatInput when a trigger character is detected.
 */

"use client";

import { useEffect, useRef } from "react";
import { FileText, Folder, MessageCircle, File, Wrench } from "lucide-react";
import { cn } from "@/lib/core/utils";

export interface SuggestionItem {
  id: string;
  label: string;
  description?: string;
  contentType?: string;
  /** For commands: text to insert when selected */
  insertText?: string;
}

interface ChatSuggestionMenuProps {
  items: SuggestionItem[];
  selectedIndex: number;
  onSelect: (item: SuggestionItem) => void;
  mode: "mention" | "command";
}

function getItemIcon(item: SuggestionItem, mode: "mention" | "command") {
  const cls = "h-3.5 w-3.5 shrink-0";
  if (mode === "command")
    return <Wrench className={cn(cls, "text-purple-400")} />;
  switch (item.contentType) {
    case "note":
      return <FileText className={cn(cls, "text-blue-400")} />;
    case "folder":
      return <Folder className={cn(cls, "text-yellow-400")} />;
    case "chat":
      return <MessageCircle className={cn(cls, "text-green-400")} />;
    default:
      return <File className={cn(cls, "text-gray-400")} />;
  }
}

export function ChatSuggestionMenu({
  items,
  selectedIndex,
  onSelect,
  mode,
}: ChatSuggestionMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Scroll selected item into view
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const selected = menu.querySelector(
      '[data-selected="true"]'
    ) as HTMLElement;
    selected?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (items.length === 0) return null;

  return (
    <div
      ref={menuRef}
      className={cn(
        "absolute bottom-full left-0 right-0 mb-1 z-50",
        "max-h-48 overflow-y-auto rounded-lg",
        "border border-white/10 bg-[#1a1a1a] shadow-xl",
        "backdrop-blur-sm"
      )}
    >
      <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-gray-500 font-medium border-b border-white/5">
        {mode === "mention" ? "Mention a file" : "Commands"}
      </div>
      {items.map((item, i) => (
        <button
          key={item.id}
          data-selected={i === selectedIndex}
          onMouseDown={(e) => {
            e.preventDefault(); // Prevent textarea blur
            onSelect(item);
          }}
          className={cn(
            "flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors",
            i === selectedIndex
              ? "bg-white/10 text-white"
              : "text-gray-400 hover:bg-white/5 hover:text-gray-200"
          )}
        >
          {getItemIcon(item, mode)}
          <span className="truncate font-medium">{item.label}</span>
          {item.description && (
            <span className="ml-auto truncate text-[10px] text-gray-600 max-w-[40%]">
              {item.description}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
