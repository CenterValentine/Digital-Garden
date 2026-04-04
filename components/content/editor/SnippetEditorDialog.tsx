/**
 * Snippet Editor Dialog
 *
 * Modal dialog for editing an existing snippet in-place.
 * Snippets are primarily plain text, so this uses a textarea
 * rather than a full TipTap editor.
 *
 * Opened via CustomEvent "edit-snippet" with detail: { snippetId: string }
 *
 * Epoch 11 Sprint 45: Content Templates + Snippets
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useSnippetStore } from "@/state/snippet-store";
import type { SnippetWithCategory } from "@/lib/domain/snippets";

export function SnippetEditorDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [snippet, setSnippet] = useState<SnippetWithCategory | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const categories = useSnippetStore((s) => s.categories);

  // Listen for the open event
  useEffect(() => {
    const handleOpen = async (e: Event) => {
      const detail = (e as CustomEvent<{ snippetId: string }>).detail;
      if (!detail?.snippetId) return;

      try {
        const res = await fetch(`/api/content/snippets/${detail.snippetId}`);
        if (!res.ok) {
          toast.error("Failed to load snippet");
          return;
        }
        const data: SnippetWithCategory = await res.json();
        setSnippet(data);
        setTitle(data.title || data.displayTitle);
        setContent(data.content);
        setCategoryId(data.categoryId);
        setIsOpen(true);
      } catch {
        toast.error("Failed to load snippet");
      }
    };

    window.addEventListener("edit-snippet", handleOpen);
    return () => window.removeEventListener("edit-snippet", handleOpen);
  }, []);

  // Focus title when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => titleRef.current?.focus(), 150);
    }
  }, [isOpen]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setSnippet(null);
    setTitle("");
    setContent("");
    setCategoryId("");
  }, []);

  const handleSave = useCallback(async () => {
    if (!snippet || isSaving) return;
    const trimmedContent = content.trim();
    if (!trimmedContent) {
      toast.error("Content cannot be empty");
      return;
    }

    setIsSaving(true);
    try {
      const trimmedTitle = title.trim();
      const res = await fetch(`/api/content/snippets/${snippet.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: trimmedTitle || null,
          content: trimmedContent,
          categoryId: categoryId !== snippet.categoryId ? categoryId : undefined,
          searchText: (trimmedTitle || trimmedContent.slice(0, 100)).toLowerCase(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to save snippet");
        return;
      }

      toast.success(`Snippet "${trimmedTitle || trimmedContent.slice(0, 30)}" saved`);
      useSnippetStore.getState().fetchSnippets();
      handleClose();
    } catch {
      toast.error("Failed to save snippet");
    } finally {
      setIsSaving(false);
    }
  }, [snippet, title, content, categoryId, isSaving, handleClose]);

  const handleDelete = useCallback(async () => {
    if (!snippet || isDeleting) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/content/snippets/${snippet.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        toast.error("Failed to delete snippet");
        return;
      }

      toast.success(`Snippet "${snippet.displayTitle}" deleted`);
      useSnippetStore.getState().fetchSnippets();
      handleClose();
    } catch {
      toast.error("Failed to delete snippet");
    } finally {
      setIsDeleting(false);
    }
  }, [snippet, isDeleting, handleClose]);

  // Close on Escape, save on ⌘S
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
      if (e.key === "s" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleClose, handleSave]);

  if (!isOpen || !snippet) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="w-full max-w-lg rounded-xl border border-white/15 bg-white dark:bg-gray-900/95 shadow-2xl backdrop-blur-md flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-white/10">
          <div className="flex-1 min-w-0 mr-3">
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-sm font-medium bg-transparent border-none text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none"
              placeholder="Snippet title (optional)..."
            />
            <div className="flex items-center gap-1.5 mt-0.5">
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="text-[10px] text-gray-400 dark:text-gray-500 bg-transparent border-none cursor-pointer hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <span className="text-[10px] text-gray-400 dark:text-gray-500">
                · Used {snippet.usageCount} time{snippet.usageCount !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-white/10 transition-colors text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto border-b border-gray-200 dark:border-white/10">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full min-h-[200px] max-h-[400px] px-4 py-3 text-sm bg-transparent text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none resize-none"
            placeholder="Snippet content..."
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2.5">
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={handleClose}
              className="px-3 py-1.5 text-xs rounded-md text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !content.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              {isSaving ? "Saving..." : "Save (⌘S)"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
