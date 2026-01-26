/**
 * Unified Settings Store
 *
 * Manages all user settings with backend synchronization.
 * localStorage used as fast cache, database as source of truth.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UserSettings } from "@/lib/features/settings/validation";
import { DEFAULT_SETTINGS } from "@/lib/features/settings/validation";

interface SettingsStore extends UserSettings {
  // Sync state
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  hasPendingChanges: boolean;
  error: string | null;

  // Actions
  fetchFromBackend: () => Promise<void>;
  saveToBackend: () => Promise<void>;
  reset: () => Promise<void>;

  // Section updaters (auto-save to backend)
  setUISettings: (ui: Partial<UserSettings["ui"]>) => Promise<void>;
  setFileSettings: (files: Partial<UserSettings["files"]>) => Promise<void>;
  setSearchSettings: (search: Partial<UserSettings["search"]>) => Promise<void>;
  setEditorSettings: (editor: Partial<UserSettings["editor"]>) => Promise<void>;
  setAISettings: (ai: Partial<UserSettings["ai"]>) => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      // Default state
      ...DEFAULT_SETTINGS,
      isSyncing: false,
      lastSyncedAt: null,
      hasPendingChanges: false,
      error: null,

      // Fetch from backend
      fetchFromBackend: async () => {
        set({ isSyncing: true, error: null });
        try {
          const response = await fetch("/api/user/settings");
          const data = await response.json();

          if (data.success) {
            set({
              ...data.data,
              lastSyncedAt: new Date(),
              hasPendingChanges: false,
              isSyncing: false,
              error: null,
            });
          } else {
            throw new Error(data.error || "Failed to fetch settings");
          }
        } catch (error) {
          console.error("[Settings Store] Fetch failed:", error);
          set({
            error: error instanceof Error ? error.message : "Fetch failed",
            isSyncing: false,
          });
        }
      },

      // Save to backend
      saveToBackend: async () => {
        const { isSyncing, lastSyncedAt, hasPendingChanges, error, ...settings } =
          get();

        set({ isSyncing: true, error: null });
        try {
          const response = await fetch("/api/user/settings", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(settings),
          });

          const data = await response.json();

          if (data.success) {
            set({
              lastSyncedAt: new Date(),
              hasPendingChanges: false,
              isSyncing: false,
              error: null,
            });
          } else {
            throw new Error(data.error || "Failed to save settings");
          }
        } catch (error) {
          console.error("[Settings Store] Save failed:", error);
          set({
            hasPendingChanges: true, // Mark for retry
            error: error instanceof Error ? error.message : "Save failed",
            isSyncing: false,
          });
        }
      },

      // Reset to defaults
      reset: async () => {
        set({ isSyncing: true, error: null });
        try {
          const response = await fetch("/api/user/settings/reset", {
            method: "POST",
          });
          const data = await response.json();

          if (data.success) {
            set({
              ...data.data,
              lastSyncedAt: new Date(),
              hasPendingChanges: false,
              isSyncing: false,
              error: null,
            });
          } else {
            throw new Error(data.error || "Failed to reset settings");
          }
        } catch (error) {
          console.error("[Settings Store] Reset failed:", error);
          set({
            error: error instanceof Error ? error.message : "Reset failed",
            isSyncing: false,
          });
        }
      },

      // Section updaters (with auto-save)
      setUISettings: async (ui) => {
        set((state) => ({
          ui: { ...state.ui, ...ui },
          hasPendingChanges: true,
        }));
        await get().saveToBackend();
      },

      setFileSettings: async (files) => {
        set((state) => ({
          files: { ...state.files, ...files },
          hasPendingChanges: true,
        }));
        await get().saveToBackend();
      },

      setSearchSettings: async (search) => {
        set((state) => ({
          search: { ...state.search, ...search },
          hasPendingChanges: true,
        }));
        await get().saveToBackend();
      },

      setEditorSettings: async (editor) => {
        set((state) => ({
          editor: { ...state.editor, ...editor },
          hasPendingChanges: true,
        }));
        await get().saveToBackend();
      },

      setAISettings: async (ai) => {
        set((state) => ({
          ai: { ...state.ai, ...ai },
          hasPendingChanges: true,
        }));
        await get().saveToBackend();
      },
    }),
    {
      name: "notes:settings",
      version: 1,
      // localStorage as cache
      // Always fetch from backend on mount
    }
  )
);
