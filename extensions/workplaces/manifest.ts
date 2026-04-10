import type { ExtensionManifest } from "@/lib/extensions/types";

export const WORKPLACES_EXTENSION_ID = "workplaces";

export const workplacesExtensionManifest: ExtensionManifest = {
  id: WORKPLACES_EXTENSION_ID,
  label: "Workplaces",
  description:
    "Built-in workplace extension for saved workspace layouts, ownership flows, and overlap protection.",
  iconName: "Briefcase",
  enabledByDefault: true,
  canDisable: true,
  navItems: [],
  surfaces: ["shell", "global-dialog"],
};
