import type { ExtensionManifest } from "@/lib/extensions/types";

export const PUBLISHING_EXTENSION_ID = "publishing";
export const PUBLISHING_VIEW_ID = "publishing-view";

export const publishingExtensionManifest: ExtensionManifest = {
  id: PUBLISHING_EXTENSION_ID,
  label: "Publishing",
  description: "Publish notes publicly as blog posts, projects, and portfolio pages.",
  iconName: "Globe",
  enabledByDefault: true,
  canDisable: true,
  navItems: [
    {
      type: "view",
      view: PUBLISHING_VIEW_ID,
      label: "Publishing",
      title: "Publishing",
      iconName: "Globe",
      order: 80,
    },
  ],
  surfaces: ["left-sidebar", "right-sidebar", "shell"],
};
