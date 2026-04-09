import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getExtensionManifestById } from "@/lib/extensions/registry";

interface ExtensionActivationState {
  overrides: Record<string, boolean>;
  setExtensionEnabled: (extensionId: string, enabled: boolean) => void;
  isExtensionEnabled: (extensionId: string) => boolean;
}

function resolveDefaultEnabled(extensionId: string) {
  return getExtensionManifestById(extensionId)?.enabledByDefault ?? false;
}

export const useExtensionActivationStore = create<ExtensionActivationState>()(
  persist(
    (set, get) => ({
      overrides: {},
      setExtensionEnabled: (extensionId, enabled) => {
        const defaultEnabled = resolveDefaultEnabled(extensionId);
        set((state) => {
          const nextOverrides = { ...state.overrides };
          if (enabled === defaultEnabled) {
            delete nextOverrides[extensionId];
          } else {
            nextOverrides[extensionId] = enabled;
          }
          return { overrides: nextOverrides };
        });
      },
      isExtensionEnabled: (extensionId) => {
        const override = get().overrides[extensionId];
        return override ?? resolveDefaultEnabled(extensionId);
      },
    }),
    {
      name: "extension-activation-state",
      version: 1,
    }
  )
);
