/**
 * Template Picker
 *
 * Modal popup for browsing and inserting content templates.
 * Triggered by the "/template" slash command via CustomEvent.
 *
 * Epoch 11 Sprint 45: Content Templates + Snippets
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Search, FileText } from "lucide-react";
import type { JSONContent } from "@tiptap/core";
import { useEditorInstanceStore } from "@/state/editor-instance-store";
import { useTemplateStore } from "@/state/template-store";
import type { ContentTemplateWithCategory } from "@/lib/domain/templates";
import { getViewerExtensions } from "@/lib/domain/editor/extensions-client";
import { sanitizeTipTapJsonWithExtensions } from "@/lib/domain/editor/unsupported-content";
import { instantiateTemplateContent } from "@/lib/domain/editor/template-instantiation";

let templateInsertExtensions: ReturnType<typeof getViewerExtensions> | null = null;

function getTemplateInsertExtensions() {
  if (!templateInsertExtensions) templateInsertExtensions = getViewerExtensions();
  return templateInsertExtensions;
}

export function TemplatePicker() {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { templates, recentTemplates, isLoading, fetchTemplates, fetchCategories } =
    useTemplateStore();

  // Listen for the open event from slash commands
  useEffect(() => {
    const handleOpen = () => {
      setIsOpen(true);
      // Reset loading state in case a previous fetch left it stuck
      useTemplateStore.setState({ isLoading: false });
      fetchCategories();
      fetchTemplates();
    };

    window.addEventListener("open-template-picker", handleOpen);
    return () => window.removeEventListener("open-template-picker", handleOpen);
  }, [fetchTemplates, fetchCategories]);

  // Auto-focus search input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleSelect = useCallback((template: ContentTemplateWithCategory) => {
    const editor = Object.values(useEditorInstanceStore.getState().editorsByContentId).find(Boolean) ?? null;
    if (!editor) return;

    const tiptapJson = template.tiptapJson as { content?: unknown[] };
    if (tiptapJson?.content) {
      const instantiated = instantiateTemplateContent(
        {
          type: "doc",
          content: tiptapJson.content as JSONContent[],
        },
        {
          regenerateBlockIds: true,
        }
      );
      const sanitized = sanitizeTipTapJsonWithExtensions(
        instantiated,
        getTemplateInsertExtensions()
      );
      editor.chain().focus().insertContent(sanitized.json.content ?? []).run();
    }

    setIsOpen(false);
    setSearch("");

    // Track usage
    fetch(`/api/content/templates/${template.id}/use`, { method: "POST" }).catch(() => {});
    fetchTemplates();
  }, [fetchTemplates]);

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

  const allTemplates = [...templates];
  const filtered = allTemplates.filter((t) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      t.title.toLowerCase().includes(q) ||
      t.categoryName.toLowerCase().includes(q)
    );
  });

  // Group by category
  const grouped = filtered.reduce<Record<string, ContentTemplateWithCategory[]>>(
    (acc, t) => {
      const key = t.categoryName;
      if (!acc[key]) acc[key] = [];
      acc[key].push(t);
      return acc;
    },
    {}
  );

  // Recent templates (only shown when no search)
  const recentFiltered = search
    ? []
    : recentTemplates.filter((r) => !filtered.some((f) => f.id === r.id)).slice(0, 3);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="w-full max-w-md rounded-xl border border-white/15 bg-gray-900/95 shadow-2xl backdrop-blur-md">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h3 className="text-sm font-medium text-gray-100 flex items-center gap-2">
            <FileText className="h-4 w-4 text-gray-400" />
            Content Templates
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
              placeholder="Search templates..."
              className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md bg-white/8 border border-white/15 text-gray-200 placeholder:text-gray-500 focus:border-white/30 focus:outline-none"
            />
          </div>
        </div>

        {/* Template list */}
        <div className="max-h-80 overflow-y-auto p-2">
          {isLoading && (
            <p className="text-xs text-gray-400 text-center py-4">Loading templates...</p>
          )}

          {!isLoading && filtered.length === 0 && recentFiltered.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-4">
              {templates.length === 0
                ? "No templates yet. Select text in the editor and right-click to save as template."
                : "No templates match your search."}
            </p>
          )}

          {/* Recent section */}
          {recentFiltered.length > 0 && (
            <div className="mb-2">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 px-2 py-1">
                Recent
              </p>
              {recentFiltered.map((t) => (
                <button
                  key={`recent-${t.id}`}
                  onClick={() => handleSelect(t)}
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-white/10 transition-colors"
                >
                  <p className="text-sm text-gray-200">{t.title}</p>
                  <p className="text-xs text-gray-500">{t.categoryName}</p>
                </button>
              ))}
            </div>
          )}

          {Object.entries(grouped).map(([category, items]) => (
            <div key={category} className="mb-2">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 px-2 py-1">
                {category}
              </p>
              {items.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleSelect(t)}
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-white/10 transition-colors"
                >
                  <p className="text-sm text-gray-200">{t.title}</p>
                  <p className="text-xs text-gray-500">
                    Used {t.usageCount} time{t.usageCount !== 1 ? "s" : ""}
                  </p>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
