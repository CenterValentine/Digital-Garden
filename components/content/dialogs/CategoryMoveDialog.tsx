/**
 * Category Move Dialog
 *
 * When deleting a category that contains items, prompts the user to
 * choose a destination category for those items before proceeding.
 *
 * Opened via CustomEvent "delete-category-confirm" with detail:
 *   { categoryId, categoryName, scope, itemCount }
 *
 * Epoch 11 Sprint 45: Content Templates + Snippets
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useTemplateStore } from "@/state/template-store";
import { useSnippetStore } from "@/state/snippet-store";

interface DeleteCategoryDetail {
  categoryId: string;
  categoryName: string;
  scope: "content_template" | "snippet";
  itemCount: number;
}

export function CategoryMoveDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [detail, setDetail] = useState<DeleteCategoryDetail | null>(null);
  const [moveToId, setMoveToId] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const handleOpen = (e: Event) => {
      const d = (e as CustomEvent<DeleteCategoryDetail>).detail;
      if (!d?.categoryId) return;
      setDetail(d);
      setMoveToId("");
      setIsOpen(true);
    };

    window.addEventListener("delete-category-confirm", handleOpen);
    return () => window.removeEventListener("delete-category-confirm", handleOpen);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setDetail(null);
    setMoveToId("");
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!detail || !moveToId || isProcessing) return;

    setIsProcessing(true);
    try {
      const res = await fetch(
        `/api/content/reusable-categories/${detail.categoryId}?moveTo=${moveToId}`,
        { method: "DELETE" },
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to delete category");
        return;
      }

      toast.warning(`Category "${detail.categoryName}" deleted — ${detail.itemCount} item${detail.itemCount !== 1 ? "s" : ""} moved`);

      // Refresh stores
      if (detail.scope === "content_template") {
        useTemplateStore.getState().fetchCategories();
        useTemplateStore.getState().fetchTemplates();
      } else {
        useSnippetStore.getState().fetchCategories();
        useSnippetStore.getState().fetchSnippets();
      }

      handleClose();
    } catch {
      toast.error("Failed to delete category");
    } finally {
      setIsProcessing(false);
    }
  }, [detail, moveToId, isProcessing, handleClose]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleClose]);

  if (!isOpen || !detail) return null;

  // Get other categories for the same scope
  const categories = detail.scope === "content_template"
    ? useTemplateStore.getState().categories
    : useSnippetStore.getState().categories;

  const otherCategories = categories.filter((c) => c.id !== detail.categoryId);
  const itemLabel = detail.scope === "content_template" ? "template" : "snippet";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="w-full max-w-sm rounded-xl border border-white/15 bg-white dark:bg-gray-900/95 shadow-2xl backdrop-blur-md">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-white/10">
          <div className="flex-shrink-0 p-1.5 rounded-full bg-amber-100 dark:bg-amber-500/20">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Delete &ldquo;{detail.categoryName}&rdquo;
            </h3>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
              {detail.itemCount} {itemLabel}{detail.itemCount !== 1 ? "s" : ""} will be moved
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="px-4 py-3">
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            Move {itemLabel}s to:
          </label>
          {otherCategories.length > 0 ? (
            <select
              value={moveToId}
              onChange={(e) => setMoveToId(e.target.value)}
              className="w-full px-2.5 py-1.5 text-sm rounded-md border border-gray-300 dark:border-white/20 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:border-primary"
            >
              <option value="">Select a category...</option>
              {otherCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400 italic">
              No other categories available. Create another category first.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-2.5 border-t border-gray-200 dark:border-white/10">
          <button
            onClick={handleClose}
            className="px-3 py-1.5 text-xs rounded-md text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!moveToId || isProcessing}
            className="px-3 py-1.5 text-xs rounded-md bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? "Deleting..." : "Move & Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
