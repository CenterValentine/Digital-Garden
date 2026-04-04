/**
 * Template Store
 *
 * Client-side state for content templates and their categories.
 *
 * Epoch 11 Sprint 45: Content Templates + Snippets
 */

import { create } from "zustand";
import type { ContentTemplateWithCategory, ReusableCategoryWithCount } from "@/lib/domain/templates";

interface TemplateStore {
  categories: ReusableCategoryWithCount[];
  templates: ContentTemplateWithCategory[];
  recentTemplates: ContentTemplateWithCategory[];
  isLoaded: boolean;
  isLoading: boolean;

  fetchCategories: () => Promise<void>;
  fetchTemplates: (categoryId?: string) => Promise<void>;
  reset: () => void;
}

export const useTemplateStore = create<TemplateStore>((set, get) => ({
  categories: [],
  templates: [],
  recentTemplates: [],
  isLoaded: false,
  isLoading: false,

  fetchCategories: async () => {
    try {
      const res = await fetch("/api/content/reusable-categories?scope=content_template");
      if (!res.ok) return;
      const data = await res.json();
      set({ categories: data });
    } catch (err) {
      console.error("Failed to fetch template categories:", err);
    }
  },

  fetchTemplates: async (categoryId?: string) => {
    if (get().isLoading) return;
    set({ isLoading: true });
    try {
      const url = categoryId
        ? `/api/content/templates?categoryId=${categoryId}&recent=5`
        : "/api/content/templates?recent=5";
      const res = await fetch(url);
      if (!res.ok) {
        set({ isLoading: false });
        return;
      }
      const data = await res.json();

      // When using recent param, response is { recent, templates }
      if (data.recent && data.templates) {
        set({
          templates: data.templates,
          recentTemplates: data.recent,
          isLoaded: true,
          isLoading: false,
        });
      } else {
        set({
          templates: Array.isArray(data) ? data : [],
          isLoaded: true,
          isLoading: false,
        });
      }
    } catch (err) {
      console.error("Failed to fetch templates:", err);
      set({ isLoading: false });
    }
  },

  reset: () => {
    set({
      categories: [],
      templates: [],
      recentTemplates: [],
      isLoaded: false,
      isLoading: false,
    });
  },
}));
