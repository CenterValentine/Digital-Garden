import type { ExtensionManifest } from "@/lib/extensions/types";

export const FLASHCARDS_EXTENSION_ID = "flashcards";
export const FLASHCARDS_VIEW_KEY = "flashcards";

export const flashcardsExtensionManifest: ExtensionManifest = {
  id: FLASHCARDS_EXTENSION_ID,
  label: "Flashcards",
  description:
    "Create rich flashcards from notes and review them by skill.",
  iconName: "Layers",
  enabledByDefault: true,
  canDisable: true,
  navItems: [
    {
      view: FLASHCARDS_VIEW_KEY,
      label: "Flashcards",
      title: "Flashcards",
      iconName: "Layers",
      order: 25,
    },
  ],
  surfaces: ["left-sidebar", "global-dialog"],
};
