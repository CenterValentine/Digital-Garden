import type { ExtensionManifest } from "@/lib/extensions/types";

export const CANVAS_EXTENSION_ID = "canvas";

export const canvasExtensionManifest: ExtensionManifest = {
  id: CANVAS_EXTENSION_ID,
  label: "Canvas",
  description:
    "Bring courses you've taken in Canvas into your notes: modules become folders, pages become notes, and your submissions, grades and feedback come along. Re-import a module when Canvas changes.",
  iconName: "GraduationCap",
  enabledByDefault: false,
  canDisable: true,
  navItems: [],
  surfaces: ["global-dialog", "right-sidebar"],
  settings: {
    path: "/settings/extensions/canvas",
    label: "Canvas",
    title: "Canvas",
    description: "Your Canvas connection and course exports.",
    order: 86,
  },
};
