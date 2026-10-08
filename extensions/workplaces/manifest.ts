import type { ExtensionManifest } from "@/lib/extensions/types";

export const WORKPLACES_EXTENSION_ID = "workplaces";

export const workplacesExtensionManifest: ExtensionManifest = {
  id: WORKPLACES_EXTENSION_ID,
  label: "Workplaces",
  description:
    "Built-in workplace extension for saved workspace layouts, views, and workbenches.",
  iconName: "Briefcase",
  enabledByDefault: true,
  canDisable: true,
  navItems: [],
  surfaces: ["shell"],
  settings: {
    path: "/settings/extensions/workplaces",
    label: "Workplaces",
    title: "Workplaces",
    description: "Manage saved workplaces.",
    order: 40,
  },
};
