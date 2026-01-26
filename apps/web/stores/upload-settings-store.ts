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
      migrate: (persistedState: any, version: number) => {
        if (version === 1) {
          return {
            ...persistedState,
            officeViewerMode: 'google-docs',
            onlyofficeServerUrl: null,
          };
        }
        if (version === 2) {
          return {
            ...persistedState,
            officeViewerMode: 'google-docs',
          };
        }
        return persistedState;
      },
    }
  )
);
