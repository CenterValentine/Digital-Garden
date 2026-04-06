"use client";

/**
 * Save As Template Dialog
 *
 * Saves the current note's TipTap JSON as a Page Template.
 * Lets the user name the template, pick or create a category,
 * and optionally set a default title for new notes created from it.
 *
 * Epoch 11 Sprint 46: Page Templates
 */

import { useEffect, useRef, useState } from "react";
import type { JSONContent } from "@tiptap/core";
import { X } from "lucide-react";
import { toast } from "sonner";

interface Category {
  id: string;
  name: string;
}

interface SaveAsTemplateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  tiptapJson: JSONContent | null;
  suggestedTitle?: string;
}

export function SaveAsTemplateDialog({
  isOpen,
  onClose,
  tiptapJson,
  suggestedTitle = "",
}: SaveAsTemplateDialogProps) {
  const [title, setTitle] = useState(suggestedTitle);
  const [defaultTitle, setDefaultTitle] = useState(suggestedTitle);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<string>("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  // Load page_template categories on open
  useEffect(() => {
    if (!isOpen) return;
    setTitle(suggestedTitle);
    setDefaultTitle(suggestedTitle);
    setNewCategoryName("");
    setCreatingCategory(false);

    fetch("/api/content/reusable-categories?scope=page_template", {
      credentials: "include",
    })
      .then((r) => r.json())
      .then((data) => {
        const cats: Category[] = (data.categories ?? data ?? []).map(
          (c: { id: string; name: string }) => ({ id: c.id, name: c.name })
        );
        setCategories(cats);
        setCategoryId(cats[0]?.id ?? "");
      })
      .catch(() => toast.error("Failed to load categories"));

    setTimeout(() => titleRef.current?.focus(), 50);
  }, [isOpen, suggestedTitle]);

  if (!isOpen) return null;

  const handleCreateCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    const slug = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

    const res = await fetch("/api/content/reusable-categories", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, slug, scope: "page_template" }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error("Failed to create category");
      return;
    }
    const newCat = { id: data.id ?? data.category?.id, name };
    setCategories((prev) => [...prev, newCat]);
    setCategoryId(newCat.id);
    setNewCategoryName("");
    setCreatingCategory(false);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Template name is required");
      titleRef.current?.focus();
      return;
    }
    if (!categoryId) {
      toast.error("Please select or create a category");
      return;
    }
    if (!tiptapJson) {
      toast.error("No content to save");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/content/page-templates", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          tiptapJson,
          categoryId,
          defaultTitle: defaultTitle.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message ?? "Failed to save template");
      }
      toast.success(`Template "${title.trim()}" saved`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-md rounded-xl border border-white/10 bg-gray-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Save as Page Template</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-white/10 hover:text-white"
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Template name */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">
              Template name <span className="text-red-400">*</span>
            </label>
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              placeholder="e.g. Weekly Review"
              className="w-full rounded-md border border-white/15 bg-white/8 px-3 py-2 text-sm text-gray-200 placeholder:text-gray-600 focus:border-blue-500/50 focus:outline-none"
            />
          </div>

          {/* Default title for new notes */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">
              Default note title{" "}
              <span className="text-gray-600">(pre-filled when creating from template)</span>
            </label>
            <input
              type="text"
              value={defaultTitle}
              onChange={(e) => setDefaultTitle(e.target.value)}
              placeholder="Leave blank to use template name"
              className="w-full rounded-md border border-white/15 bg-white/8 px-3 py-2 text-sm text-gray-200 placeholder:text-gray-600 focus:border-blue-500/50 focus:outline-none"
            />
          </div>

          {/* Category */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">Category</label>
            {!creatingCategory ? (
              <div className="flex gap-2">
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="flex-1 rounded-md border border-white/15 bg-white/8 px-3 py-2 text-sm text-gray-200 focus:border-blue-500/50 focus:outline-none"
                >
                  {categories.length === 0 && (
                    <option value="" disabled>
                      No categories yet
                    </option>
                  )}
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setCreatingCategory(true)}
                  className="rounded-md border border-white/15 px-3 py-2 text-xs text-gray-400 hover:bg-white/8 hover:text-white"
                >
                  + New
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateCategory()}
                  placeholder="Category name"
                  autoFocus
                  className="flex-1 rounded-md border border-white/15 bg-white/8 px-3 py-2 text-sm text-gray-200 placeholder:text-gray-600 focus:border-blue-500/50 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleCreateCategory}
                  className="rounded-md bg-blue-600 px-3 py-2 text-xs text-white hover:bg-blue-500"
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => setCreatingCategory(false)}
                  className="rounded-md border border-white/15 px-3 py-2 text-xs text-gray-400 hover:bg-white/8"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm text-gray-400 hover:bg-white/8 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !title.trim()}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Template"}
          </button>
        </div>
      </div>
    </div>
  );
}
