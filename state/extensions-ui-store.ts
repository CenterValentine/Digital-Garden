import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ExtensionsUiState {
  selectedExtensionId: string | null;
  activeDialogExtensionId: string | null;
  setSelectedExtensionId: (extensionId: string) => void;
  openExtensionDialog: (extensionId: string) => void;
  closeExtensionDialog: () => void;
}

export const useExtensionsUiStore = create<ExtensionsUiState>()(
  persist(
    (set) => ({
      selectedExtensionId: null,
      activeDialogExtensionId: null,
      setSelectedExtensionId: (extensionId) => set({ selectedExtensionId: extensionId }),
      openExtensionDialog: (extensionId) =>
        set({
          selectedExtensionId: extensionId,
          activeDialogExtensionId: extensionId,
        }),
      closeExtensionDialog: () => set({ activeDialogExtensionId: null }),
    }),
    {
      name: "extensions-ui-state",
      version: 2,
    }
  )
);
