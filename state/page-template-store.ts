/**
 * Page Template Store
 *
 * Client-side state for page templates and their categories.
 *
 * Epoch 11 Sprint 46: Page Templates
 */

import { create } from "zustand";
import type { PageTemplateWithCategory, ReusableCategoryWithCount } from "@/lib/domain/templates";

interface PageTemplateStore {
  categories: ReusableCategoryWithCount[];
  templates: PageTemplateWithCategory[];
  isLoaded: boolean;
  isLoading: boolean;

  fetchCategories: () => Promise<void>;
  fetchTemplates: () => Promise<void>;
  reset: () => void;
}

export const usePageTemplateStore = create<PageTemplateStore>((set, get) => ({
  categories: [],
  templates: [],
  isLoaded: false,
  isLoading: false,

  fetchCategories: async () => {
    try {
      const res = await fetch("/api/content/reusable-categories?scope=page_template", {
        credentials: "include",
      });
      if (!res.ok) {
        console.error("Failed to fetch page template categories:", res.status, await res.text().catch(() => ""));
        return;
      }
      const data = await res.json();
      set({ categories: data });
    } catch (err) {
      console.error("Failed to fetch page template categories:", err);
    }
  },

  fetchTemplates: async () => {
    if (get().isLoading) return;
    set({ isLoading: true });
    try {
      const res = await fetch("/api/content/page-templates", {
        credentials: "include",
      });
      if (!res.ok) {
        console.error("Failed to fetch page templates:", res.status, await res.text().catch(() => ""));
        set({ isLoading: false });
        return;
      }
      const data = await res.json();
      set({
        templates: Array.isArray(data) ? data : [],
        isLoaded: true,
        isLoading: false,
      });
    } catch (err) {
      console.error("Failed to fetch page templates:", err);
      set({ isLoading: false });
    }
  },

  reset: () => {
    set({
      categories: [],
      templates: [],
      isLoaded: false,
      isLoading: false,
    });
  },
}));
