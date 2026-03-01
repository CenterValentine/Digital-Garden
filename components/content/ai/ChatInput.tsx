/**
 * ChatInput Component
 *
 * Auto-resizing textarea with send/stop controls.
 * Supports @ file mentions and / tool commands via suggestion menu.
 * Designed for both sidebar chat and full ChatViewer.
 */

"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type KeyboardEvent,
  type FormEvent,
} from "react";
import { ArrowUp, Square, Mic } from "lucide-react";
import { cn } from "@/lib/core/utils";
import {
  ChatSuggestionMenu,
  type SuggestionItem,
} from "./ChatSuggestionMenu";
import type { ChatStatus } from "ai";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  status: ChatStatus;
  disabled?: boolean;
  placeholder?: string;
  /** Called when user types @ followed by a query */
  onMentionSearch?: (query: string) => void;
  /** Results returned from mention search */
  mentionResults?: SuggestionItem[];
  /** Static list of / command items */
  commandItems?: SuggestionItem[];
  /** Called when a mention is inserted (parent tracks for send) */
  onMentionInserted?: (item: SuggestionItem) => void;
}

export function ChatInput({
  value,
  onChange,
  onSubmit,
  onStop,
  status,
  disabled = false,
  placeholder = "Ask anything...",
  onMentionSearch,
  mentionResults = [],
  commandItems = [],
  onMentionInserted,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const triggerPosRef = useRef<number>(-1);

  const [suggestionMode, setSuggestionMode] = useState<
    "mention" | "command" | null
  >(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filteredCommands, setFilteredCommands] = useState<SuggestionItem[]>(
    []
  );

  const isActive = status === "streaming" || status === "submitted";
  const canSend = value.trim().length > 0 && !isActive && !disabled;

  // Current suggestion items based on mode
  const suggestionItems =
    suggestionMode === "mention" ? mentionResults : filteredCommands;
  const showMenu = suggestionMode !== null && suggestionItems.length > 0;

  // Reset selected index when items change
  useEffect(() => {
    setSelectedIndex(0);
  }, [mentionResults, filteredCommands]);

  const closeSuggestions = useCallback(() => {
    setSuggestionMode(null);
    triggerPosRef.current = -1;
    setSelectedIndex(0);
    setFilteredCommands([]);
  }, []);

  const handleSelect = useCallback(
    (item: SuggestionItem) => {
      const triggerPos = triggerPosRef.current;
      if (triggerPos < 0) return;

      const textarea = textareaRef.current;
      const cursorPos = textarea?.selectionStart ?? value.length;
      const before = value.slice(0, triggerPos);
      const after = value.slice(cursorPos);

      let newValue: string;
      if (suggestionMode === "mention") {
        // Display clean @Title in textarea; parent tracks the ID for send
        newValue = `${before}@${item.label} ${after}`;
        onMentionInserted?.(item);
      } else {
        // Insert command prompt hint
        newValue = `${before}${item.insertText ?? item.label}${after}`;
      }

      onChange(newValue);
      closeSuggestions();

      // Restore focus and set cursor position after state update
      requestAnimationFrame(() => {
        if (textarea) {
          textarea.focus();
          const newCursorPos = newValue.length - after.length;
          textarea.setSelectionRange(newCursorPos, newCursorPos);
          // Auto-resize after content change
          textarea.style.height = "auto";
          textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
        }
      });
    },
    [value, onChange, closeSuggestions, suggestionMode]
  );

  const handleSubmit = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault();
      if (canSend) {
        closeSuggestions();
        onSubmit();
      }
    },
    [canSend, onSubmit, closeSuggestions]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // When suggestion menu is open, route keys to menu
      if (showMenu) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < suggestionItems.length - 1 ? prev + 1 : 0
          );
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : suggestionItems.length - 1
          );
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          if (suggestionItems[selectedIndex]) {
            handleSelect(suggestionItems[selectedIndex]);
          }
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          closeSuggestions();
          return;
        }
      }

      // Default: Enter to send, Shift+Enter for newline
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [
      showMenu,
      suggestionItems,
      selectedIndex,
      handleSelect,
      closeSuggestions,
      handleSubmit,
    ]
  );

  const handleInput = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      // Auto-resize: reset to auto, then set to scrollHeight
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
    }
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      const cursorPos = e.target.selectionStart;

      onChange(newValue);
      handleInput();

      if (suggestionMode) {
        // Update query for active suggestion mode
        const query = newValue.slice(triggerPosRef.current + 1, cursorPos);

        // Cancel if cursor moved before trigger or query has whitespace
        if (cursorPos <= triggerPosRef.current || /\s/.test(query)) {
          closeSuggestions();
          return;
        }

        if (suggestionMode === "mention") {
          onMentionSearch?.(query);
        } else {
          // Filter commands locally
          const q = query.toLowerCase();
          setFilteredCommands(
            commandItems.filter(
              (c) =>
                c.label.toLowerCase().includes(q) ||
                c.description?.toLowerCase().includes(q)
            )
          );
        }
      } else {
        // Check for new triggers
        if (cursorPos > 0) {
          const charBefore = cursorPos >= 2 ? newValue[cursorPos - 2] : "";
          const typedChar = newValue[cursorPos - 1];

          if (
            typedChar === "@" &&
            (!charBefore || /\s/.test(charBefore)) &&
            onMentionSearch
          ) {
            triggerPosRef.current = cursorPos - 1;
            setSuggestionMode("mention");
            setSelectedIndex(0);
            onMentionSearch("");
          } else if (
            typedChar === "/" &&
            (!charBefore || charBefore === "\n") &&
            commandItems.length > 0
          ) {
            triggerPosRef.current = cursorPos - 1;
            setSuggestionMode("command");
            setSelectedIndex(0);
            setFilteredCommands(commandItems);
          }
        }
      }
    },
    [
      onChange,
      handleInput,
      suggestionMode,
      closeSuggestions,
      onMentionSearch,
      commandItems,
    ]
  );

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-end gap-2 border-t border-white/10 bg-black/20 p-3"
    >
      {/* Text input with suggestion menu */}
      <div className="relative flex-1">
        {showMenu && (
          <ChatSuggestionMenu
            items={suggestionItems}
            selectedIndex={selectedIndex}
            onSelect={handleSelect}
            mode={suggestionMode!}
          />
        )}

        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || isActive}
          rows={1}
          className={cn(
            "w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5",
            "text-sm text-gray-200 placeholder-gray-500",
            "focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/10",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "transition-colors"
          )}
          style={{ maxHeight: 160 }}
        />
      </div>

      {/* Mic button placeholder (Sprint 35) */}
      <button
        type="button"
        disabled
        title="Speech input (coming soon)"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-600 cursor-not-allowed"
      >
        <Mic className="h-4 w-4" />
      </button>

      {/* Send / Stop button */}
      {isActive ? (
        <button
          type="button"
          onClick={onStop}
          title="Stop generation"
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            "bg-red-500/20 text-red-400 border border-red-500/30",
            "hover:bg-red-500/30 transition-colors"
          )}
        >
          <Square className="h-3.5 w-3.5" fill="currentColor" />
        </button>
      ) : (
        <button
          type="submit"
          disabled={!canSend}
          title="Send message"
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            "transition-colors",
            canSend
              ? "bg-blue-600/30 text-blue-400 border border-blue-500/30 hover:bg-blue-600/40"
              : "bg-white/5 text-gray-600 border border-white/5 cursor-not-allowed"
          )}
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      )}
    </form>
  );
}
