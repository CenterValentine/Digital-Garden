/**
 * Upload Settings Store
 *
 * Manages user preferences for file upload behavior.
 * Persisted to localStorage.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type UploadMode = 'automatic' | 'manual';
export type OfficeViewerMode = 'google-docs' | 'onlyoffice' | 'microsoft-viewer';

interface UploadSettingsStore {
  // Settings
  uploadMode: UploadMode;
  officeViewerMode: OfficeViewerMode;
  onlyofficeServerUrl: string | null;

  // Actions
  setUploadMode: (mode: UploadMode) => void;
  setOfficeViewerMode: (mode: OfficeViewerMode) => void;
  setOnlyofficeServerUrl: (url: string | null) => void;
}

export const useUploadSettingsStore = create<UploadSettingsStore>()(
  persist(
    (set) => ({
      // Default to automatic for backwards compatibility
      uploadMode: 'automatic',
      // Default to Google Docs (best editing experience for Google users)
      officeViewerMode: 'google-docs',
      // Default ONLYOFFICE server URL (set to null if not configured)
      onlyofficeServerUrl: null,

      setUploadMode: (mode) => set({ uploadMode: mode }),
      setOfficeViewerMode: (mode) => set({ officeViewerMode: mode }),
      setOnlyofficeServerUrl: (url) => set({ onlyofficeServerUrl: url }),
    }),
    {
      name: 'upload-settings',
      version: 3,
      // Deferred hydration: only consumed during file uploads. Defaults
      // are safe for first render; real preferences load after FCP via
      // lib/features/stores/deferred-store-hydrator.tsx.
      skipHydration: true,
      migrate: (persistedState: unknown, version: number) => {
        const state = (persistedState as Record<string, unknown>) ?? {};
        if (version === 1) {
          return {
            ...state,
            officeViewerMode: 'google-docs',
            onlyofficeServerUrl: null,
          };
        }
        if (version === 2) {
          return {
            ...state,
            officeViewerMode: 'google-docs',
          };
        }
        return state;
      },
    }
  )
);
