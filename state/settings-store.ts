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
import { clientLogger } from "@/lib/core/logger/client";

interface SettingsStore extends UserSettings {
  // Sync state
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  hasPendingChanges: boolean;
  error: string | null;

  // Actions
  fetchFromBackend: () => Promise<void>;
  /**
   * Push settings to the server. With `patch`, ONLY that partial is sent
   * (the PATCH route deep-merges server-side); without, the legacy
   * whole-snapshot is sent. Prefer scoped patches: the store is
   * localStorage-persisted per tab, so a whole-snapshot save from a stale
   * tab silently resurrects old values — the mechanism that kept
   * re-disabling the database tools (owner report, 2026-08-28).
   */
  saveToBackend: (patch?: Partial<UserSettings>) => Promise<void>;
  reset: () => Promise<void>;

  // Section updaters (auto-save to backend)
  setUISettings: (ui: Partial<UserSettings["ui"]>) => Promise<void>;
  setFileSettings: (files: Partial<UserSettings["files"]>) => Promise<void>;
  setSearchSettings: (search: Partial<UserSettings["search"]>) => Promise<void>;
  setEditorSettings: (editor: Partial<UserSettings["editor"]>) => Promise<void>;
  setAISettings: (ai: Partial<UserSettings["ai"]>) => Promise<void>;
  setCalendarSettings: (calendar: Partial<NonNullable<UserSettings["calendar"]>>) => Promise<void>;
  setPeriodicNotesSettings: (periodicNotes: Partial<NonNullable<UserSettings["periodicNotes"]>>) => Promise<void>;
  setFlashcardSettings: (flashcards: Partial<NonNullable<UserSettings["flashcards"]>>) => Promise<void>;
  setNotificationsSettings: (notifications: Partial<NonNullable<UserSettings["notifications"]>>) => Promise<void>;
  setStudioSettings: (studio: Partial<NonNullable<UserSettings["studio"]>>) => Promise<void>;
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

          // Not authenticated — use defaults silently (sign-in page fires this too)
          if (response.status === 401) {
            set({ isSyncing: false, error: null });
            return;
          }

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
          clientLogger.error({
            layer: "store",
            event: "settings_fetch:caught",
            summary: "fetch settings from backend failed",
            error,
          });
          set({
            error: error instanceof Error ? error.message : "Fetch failed",
            isSyncing: false,
          });
        }
      },

      // Save to backend
      saveToBackend: async (patch?: Partial<UserSettings>) => {
        const current = get();
        const settings: Partial<UserSettings> = patch
          ? { version: current.version, ...patch }
          : {
              version: current.version,
              ui: current.ui,
              files: current.files,
              fileTree: current.fileTree,
              external: current.external,
              search: current.search,
              editor: current.editor,
              ai: current.ai,
              exportBackup: current.exportBackup,
              calendar: current.calendar,
              periodicNotes: current.periodicNotes,
              flashcards: current.flashcards,
              notifications: current.notifications,
              studio: current.studio,
            };

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
          clientLogger.error({
            layer: "store",
            event: "settings_save:caught",
            summary: "save settings to backend failed",
            error,
          });
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
          clientLogger.error({
            layer: "store",
            event: "settings_reset:caught",
            summary: "reset settings failed",
            error,
          });
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
        // Scoped: send ONLY the delta. A whole-snapshot here let any stale
        // tab's incidental save clobber ai.toolConfig server-side.
        await get().saveToBackend({ ai } as Partial<UserSettings>);
      },

      setCalendarSettings: async (calendar) => {
        set((state) => ({
          calendar: { ...state.calendar, ...calendar },
          hasPendingChanges: true,
        }));
        await get().saveToBackend();
      },

      setPeriodicNotesSettings: async (periodicNotes) => {
        set((state) => ({
          periodicNotes: {
            ...state.periodicNotes,
            ...periodicNotes,
            daily: {
              ...state.periodicNotes?.daily,
              ...periodicNotes.daily,
            },
            weekly: {
              ...state.periodicNotes?.weekly,
              ...periodicNotes.weekly,
            },
            monthly: {
              ...state.periodicNotes?.monthly,
              ...periodicNotes.monthly,
            },
            quarterly: {
              ...state.periodicNotes?.quarterly,
              ...periodicNotes.quarterly,
            },
            yearly: {
              ...state.periodicNotes?.yearly,
              ...periodicNotes.yearly,
            },
          },
          hasPendingChanges: true,
        }));
        await get().saveToBackend();
      },

      setFlashcardSettings: async (flashcards) => {
        set((state) => ({
          flashcards: {
            ...state.flashcards,
            ...flashcards,
          },
          hasPendingChanges: true,
        }));
        await get().saveToBackend();
      },

      setNotificationsSettings: async (notifications) => {
        set((state) => ({
          notifications: {
            ...state.notifications,
            ...notifications,
            kinds: {
              ...state.notifications?.kinds,
              ...notifications.kinds,
            },
          },
          hasPendingChanges: true,
        }));
        await get().saveToBackend();
      },

      setStudioSettings: async (studio) => {
        set((state) => ({
          studio: {
            ...state.studio,
            ...studio,
          },
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
