import type { ExtensionManifest } from "@/lib/extensions/types";

export const PEOPLE_EXTENSION_ID = "people";
export const PEOPLE_VIEW_KEY = "people";

export const peopleExtensionManifest: ExtensionManifest = {
  id: PEOPLE_EXTENSION_ID,
  label: "People",
  description:
    "Built-in people extension for groups, contact records, and person-centered content.",
  iconName: "Users",
  enabledByDefault: true,
  navItems: [
    {
      view: PEOPLE_VIEW_KEY,
      label: "People",
      title: "People",
      iconName: "Users",
      order: 20,
    },
  ],
  surfaces: ["left-sidebar", "content-viewer"],
};
