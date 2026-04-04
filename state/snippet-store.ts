/**
 * Snippet Store
 *
 * Client-side state for snippets and their categories.
 *
 * Epoch 11 Sprint 45: Content Templates + Snippets
 */

import { create } from "zustand";
import type { SnippetWithCategory } from "@/lib/domain/snippets";
import type { ReusableCategoryWithCount } from "@/lib/domain/templates";

interface SnippetStore {
  categories: ReusableCategoryWithCount[];
  snippets: SnippetWithCategory[];
  isLoaded: boolean;
  isLoading: boolean;

  fetchCategories: () => Promise<void>;
  fetchSnippets: (opts?: { categoryId?: string; aiContext?: boolean; visible?: boolean }) => Promise<void>;
  reset: () => void;
}

export const useSnippetStore = create<SnippetStore>((set, get) => ({
  categories: [],
  snippets: [],
  isLoaded: false,
  isLoading: false,

  fetchCategories: async () => {
    try {
      const res = await fetch("/api/content/reusable-categories?scope=snippet");
      if (!res.ok) return;
      const data = await res.json();
      set({ categories: data });
    } catch (err) {
      console.error("Failed to fetch snippet categories:", err);
    }
  },

  fetchSnippets: async (opts?: { categoryId?: string; aiContext?: boolean; visible?: boolean }) => {
    if (get().isLoading) return;
    set({ isLoading: true });
    try {
      const params = new URLSearchParams();
      if (opts?.categoryId) params.set("categoryId", opts.categoryId);
      if (opts?.aiContext !== undefined) params.set("aiContext", String(opts.aiContext));
      if (opts?.visible !== undefined) params.set("visible", String(opts.visible));

      const url = `/api/content/snippets${params.toString() ? `?${params}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) {
        set({ isLoading: false });
        return;
      }
      const data = await res.json();
      set({
        snippets: Array.isArray(data) ? data : [],
        isLoaded: true,
        isLoading: false,
      });
    } catch (err) {
      console.error("Failed to fetch snippets:", err);
      set({ isLoading: false });
    }
  },

  reset: () => {
    set({
      categories: [],
      snippets: [],
      isLoaded: false,
      isLoading: false,
    });
  },
}));
