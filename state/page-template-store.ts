/**
 * Page Template Store
 *
 * Client-side state for page templates and their categories.
 *
 * Epoch 11 Sprint 46: Page Templates
 */

import { create } from "zustand";
import type { PageTemplateWithCategory, ReusableCategoryWithCount } from "@/lib/domain/templates";
import { clientLogger } from "@/lib/core/logger/client";

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
        clientLogger.error({
          layer: "store",
          event: "page_template_categories_fetch:failed",
          summary: "page template categories api non-ok",
          attrs: { status: res.status },
        });
        return;
      }
      const data = await res.json();
      set({ categories: data });
    } catch (err) {
      clientLogger.error({
        layer: "store",
        event: "page_template_categories_fetch:caught",
        summary: "fetch page template categories failed",
        error: err,
      });
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
        clientLogger.error({
          layer: "store",
          event: "page_templates_fetch:failed",
          summary: "page templates api non-ok",
          attrs: { status: res.status },
        });
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
      clientLogger.error({
        layer: "store",
        event: "page_templates_fetch:caught",
        summary: "fetch page templates failed",
        error: err,
      });
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
