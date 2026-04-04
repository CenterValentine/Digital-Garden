/**
 * ChatSnippetMenu
 *
 * Popup for attaching knowledge snippets to chat messages as AI context.
 * Opens via CustomEvent from the ChatInput snippet button.
 *
 * Epoch 11 Sprint 45: Content Templates + Snippets
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Search, Scissors, Check } from "lucide-react";
import { useSnippetStore } from "@/state/snippet-store";
import type { SnippetWithCategory } from "@/lib/domain/snippets";

interface ChatSnippetMenuProps {
  onSelect: (snippetId: string, displayTitle: string) => void;
  selectedIds: string[];
}

export function ChatSnippetMenu({ onSelect, selectedIds }: ChatSnippetMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { snippets, isLoading, fetchSnippets, fetchCategories } = useSnippetStore();

  useEffect(() => {
    const handleOpen = () => {
      setIsOpen(true);
      fetchCategories();
      fetchSnippets({ visible: true });
    };

    window.addEventListener("open-chat-snippet-menu", handleOpen);
    return () => window.removeEventListener("open-chat-snippet-menu", handleOpen);
  }, [fetchSnippets, fetchCategories]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleSelect = useCallback((snippet: SnippetWithCategory) => {
    onSelect(snippet.id, snippet.displayTitle);
    // Don't close — allow multiple selections
  }, [onSelect]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setSearch("");
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  const visibleSnippets = snippets.filter((s) => s.isVisibleInUI);
  const filtered = visibleSnippets.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.displayTitle.toLowerCase().includes(q) ||
      s.content.toLowerCase().includes(q) ||
      s.categoryName.toLowerCase().includes(q)
    );
  });

  const grouped = filtered.reduce<Record<string, SnippetWithCategory[]>>(
    (acc, s) => {
      const key = s.categoryName;
      if (!acc[key]) acc[key] = [];
      acc[key].push(s);
      return acc;
    },
    {}
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center pb-20 bg-black/20">
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-gray-900/95 shadow-2xl backdrop-blur-sm">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
          <h3 className="text-xs font-medium flex items-center gap-2 text-gray-300">
            <Scissors className="h-3.5 w-3.5" />
            Attach Snippets
            {selectedIds.length > 0 && (
              <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">
                {selectedIds.length} selected
              </span>
            )}
          </h3>
          <button
            onClick={handleClose}
            className="p-1 rounded hover:bg-white/10 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-white/10">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 opacity-40" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search snippets..."
              className="w-full pl-7 pr-3 py-1.5 text-xs rounded-md bg-white/5 border border-white/10 focus:border-white/30 focus:outline-none"
            />
          </div>
        </div>

        {/* Snippet list */}
        <div className="max-h-60 overflow-y-auto p-1.5">
          {isLoading && (
            <p className="text-xs opacity-40 text-center py-3">Loading...</p>
          )}

          {!isLoading && filtered.length === 0 && (
            <p className="text-xs opacity-40 text-center py-3">
              {snippets.length === 0
                ? "No snippets available."
                : "No snippets match your search."}
            </p>
          )}

          {Object.entries(grouped).map(([category, items]) => (
            <div key={category} className="mb-1.5">
              <p className="text-[9px] uppercase tracking-wider opacity-40 px-2 py-0.5">
                {category}
              </p>
              {items.map((s) => {
                const isSelected = selectedIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() => handleSelect(s)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-md transition-colors flex items-center justify-between ${
                      isSelected
                        ? "bg-blue-500/10 border border-blue-500/20"
                        : "hover:bg-white/10"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs truncate">{s.displayTitle}</p>
                      <p className="text-[10px] opacity-40 truncate">{s.content.slice(0, 80)}</p>
                    </div>
                    {isSelected && (
                      <Check className="h-3 w-3 text-blue-400 shrink-0 ml-2" />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Done button */}
        {selectedIds.length > 0 && (
          <div className="px-3 py-2 border-t border-white/10">
            <button
              onClick={handleClose}
              className="w-full text-xs py-1.5 rounded-md bg-blue-600/30 text-blue-400 hover:bg-blue-600/40 transition-colors"
            >
              Done ({selectedIds.length} attached)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
