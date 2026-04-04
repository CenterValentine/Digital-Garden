/**
 * Save as Page Template Dialog
 *
 * Modal dialog for saving the current note as a page template.
 * Triggered from the toolbar "Save as Template" button.
 *
 * Sprint 46: Page Templates
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Plus } from "lucide-react";
import { toast } from "sonner";
import { usePageTemplateStore } from "@/state/page-template-store";

interface SaveAsPageTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noteTitle: string;
  tiptapJson: unknown;
}

export function SaveAsPageTemplateDialog({
  open,
  onOpenChange,
  noteTitle,
  tiptapJson,
}: SaveAsPageTemplateDialogProps) {
  const [title, setTitle] = useState("");
  const [defaultTitle, setDefaultTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const categories = usePageTemplateStore((s) => s.categories);
  const fetchCategories = usePageTemplateStore((s) => s.fetchCategories);
  const fetchTemplates = usePageTemplateStore((s) => s.fetchTemplates);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setTitle(noteTitle || "");
      setDefaultTitle(noteTitle || "");
      setNewCategoryName("");
      setShowNewCategory(false);
      setIsSaving(false);

      // Fetch categories and set initial selection
      const init = async () => {
        if (categories.length === 0) {
          await fetchCategories();
        }
        // Set initial category from freshly loaded store
        const cats = usePageTemplateStore.getState().categories;
        if (cats.length > 0) {
          setCategoryId(cats[0].id);
        } else {
          setCategoryId("");
        }
      };
      init();
    }
    // Only reset when dialog opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, noteTitle]);

  const handleCreateCategory = useCallback(async () => {
    if (!newCategoryName.trim()) return;

    try {
      const res = await fetch("/api/content/reusable-categories", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCategoryName.trim(),
          scope: "page_template",
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to create category");
        return;
      }

      const newCat = await res.json();
      await fetchCategories();
      setCategoryId(newCat.id);
      setNewCategoryName("");
      setShowNewCategory(false);
      toast.success(`Category "${newCat.name}" created`);
    } catch {
      toast.error("Failed to create category");
    }
  }, [newCategoryName, fetchCategories]);

  const handleSave = useCallback(async () => {
    if (!title.trim()) {
      toast.error("Template title is required");
      return;
    }

    if (!categoryId) {
      toast.error("Please select a category");
      return;
    }

    setIsSaving(true);

    try {
      const res = await fetch("/api/content/page-templates", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          tiptapJson,
          categoryId,
          defaultTitle: defaultTitle.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to save template");
        setIsSaving(false);
        return;
      }

      toast.success(`Page template "${title.trim()}" saved`);
      await fetchTemplates();
      onOpenChange(false);
    } catch {
      toast.error("Failed to save template");
    } finally {
      setIsSaving(false);
    }
  }, [title, defaultTitle, categoryId, tiptapJson, fetchTemplates, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={() => onOpenChange(false)}
      />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-md rounded-lg border border-white/10 bg-[#1a1a1a] p-6 shadow-xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">
            Save as Page Template
          </h2>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded p-1 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <div className="space-y-4">
          {/* Template Title */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-300">
              Template Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Meeting Notes, Project Brief..."
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-gold-primary/50 focus:outline-none focus:ring-1 focus:ring-gold-primary/30"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSave();
                }
              }}
            />
          </div>

          {/* Default Title (pre-filled when creating from template) */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-300">
              Default Note Title
              <span className="ml-1 text-xs text-gray-500">(optional)</span>
            </label>
            <input
              type="text"
              value={defaultTitle}
              onChange={(e) => setDefaultTitle(e.target.value)}
              placeholder="Pre-filled title when creating from this template"
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-gold-primary/50 focus:outline-none focus:ring-1 focus:ring-gold-primary/30"
            />
            <p className="mt-1 text-[11px] text-gray-500">
              When a user creates a note from this template, this title will be pre-filled.
            </p>
          </div>

          {/* Category */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-300">
              Category
            </label>
            {!showNewCategory ? (
              <div className="flex items-center gap-2">
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="flex-1 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-gold-primary/50 focus:outline-none focus:ring-1 focus:ring-gold-primary/30"
                >
                  {categories.length === 0 && (
                    <option value="">No categories — create one</option>
                  )}
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                      {cat.isSystem ? " (System)" : ""}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setShowNewCategory(true)}
                  className="rounded-md border border-white/10 p-2 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
                  title="New category"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Category name..."
                  className="flex-1 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-gold-primary/50 focus:outline-none focus:ring-1 focus:ring-gold-primary/30"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleCreateCategory();
                    }
                    if (e.key === "Escape") {
                      setShowNewCategory(false);
                      setNewCategoryName("");
                    }
                  }}
                />
                <button
                  onClick={handleCreateCategory}
                  disabled={!newCategoryName.trim()}
                  className="rounded-md bg-gold-primary/20 px-3 py-2 text-sm font-medium text-gold-primary transition-colors hover:bg-gold-primary/30 disabled:opacity-50"
                >
                  Add
                </button>
                <button
                  onClick={() => {
                    setShowNewCategory(false);
                    setNewCategoryName("");
                  }}
                  className="rounded-md border border-white/10 px-3 py-2 text-sm text-gray-400 transition-colors hover:bg-white/10"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-md px-4 py-2 text-sm text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !title.trim() || !categoryId}
            className="rounded-md bg-gold-primary/20 px-4 py-2 text-sm font-medium text-gold-primary transition-colors hover:bg-gold-primary/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? "Saving..." : "Save Template"}
          </button>
        </div>
      </div>
    </div>
  );
}
