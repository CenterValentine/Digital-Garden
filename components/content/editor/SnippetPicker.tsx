/**
 * Snippet Picker
 *
 * Modal popup for browsing and inserting knowledge snippets.
 * Triggered by the "/snippet" slash command via CustomEvent.
 *
 * Epoch 11 Sprint 45: Content Templates + Snippets
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Search, Scissors } from "lucide-react";
import type { JSONContent } from "@tiptap/core";
import { useEditorInstanceStore } from "@/state/editor-instance-store";
import { useSnippetStore } from "@/state/snippet-store";
import type { SnippetWithCategory } from "@/lib/domain/snippets";
import { getViewerExtensions } from "@/lib/domain/editor/extensions-client";
import { sanitizeTipTapJsonWithExtensions } from "@/lib/domain/editor/unsupported-content";

const snippetInsertExtensions = getViewerExtensions();

export function SnippetPicker() {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { snippets, isLoading, fetchSnippets, fetchCategories } = useSnippetStore();

  // Listen for the open event from slash commands
  useEffect(() => {
    const handleOpen = () => {
      setIsOpen(true);
      // Reset loading state in case a previous fetch left it stuck
      useSnippetStore.setState({ isLoading: false });
      fetchCategories();
      fetchSnippets({ visible: true });
    };

    window.addEventListener("open-snippet-picker", handleOpen);
    return () => window.removeEventListener("open-snippet-picker", handleOpen);
  }, [fetchSnippets, fetchCategories]);

  // Auto-focus search input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleSelect = useCallback((snippet: SnippetWithCategory) => {
    const editor = Object.values(useEditorInstanceStore.getState().editorsByContentId).find(Boolean) ?? null;
    if (!editor) return;

    // If snippet has tiptapJson, use that; otherwise insert plain text
    if (snippet.tiptapJson) {
      const json = snippet.tiptapJson as { content?: unknown[] };
      if (json.content) {
        const sanitized = sanitizeTipTapJsonWithExtensions(
          {
            type: "doc",
            content: json.content as JSONContent[],
          },
          snippetInsertExtensions
        );
        editor.chain().focus().insertContent(sanitized.json.content ?? []).run();
      }
    } else {
      editor.chain().focus().insertContent(snippet.content).run();
    }

    setIsOpen(false);
    setSearch("");

    // Track usage
    fetch(`/api/content/snippets/${snippet.id}/use`, { method: "POST" }).catch(() => {});
    fetchSnippets();
  }, [fetchSnippets]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setSearch("");
  }, []);

  // Close on Escape
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

  // Group by category
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="w-full max-w-md rounded-xl border border-white/15 bg-gray-900/95 shadow-2xl backdrop-blur-md">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h3 className="text-sm font-medium text-gray-100 flex items-center gap-2">
            <Scissors className="h-4 w-4 text-gray-400" />
            Snippets
          </h3>
          <button
            onClick={handleClose}
            className="p-1 rounded hover:bg-white/10 transition-colors text-gray-400 hover:text-gray-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-2.5 border-b border-white/10">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search snippets..."
              className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md bg-white/8 border border-white/15 text-gray-200 placeholder:text-gray-500 focus:border-white/30 focus:outline-none"
            />
          </div>
        </div>

        {/* Snippet list */}
        <div className="max-h-80 overflow-y-auto p-2">
          {isLoading && (
            <p className="text-xs text-gray-400 text-center py-4">Loading snippets...</p>
          )}

          {!isLoading && filtered.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-4">
              {snippets.length === 0
                ? "No snippets yet. Select text in the editor and right-click to save as snippet."
                : "No snippets match your search."}
            </p>
          )}

          {Object.entries(grouped).map(([category, items]) => (
            <div key={category} className="mb-2">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 px-2 py-1">
                {category}
              </p>
              {items.map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleSelect(s)}
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-white/10 transition-colors"
                >
                  <p className="text-sm text-gray-200">{s.displayTitle}</p>
                  <p className="text-xs text-gray-500 line-clamp-2">{s.content}</p>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
