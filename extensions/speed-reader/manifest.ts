import type { ExtensionManifest } from "@/lib/extensions/types";

export const SPEED_READER_EXTENSION_ID = "speed-reader";
export const SPEED_READER_TOOL_ID = "speed-read";

export const speedReaderExtensionManifest: ExtensionManifest = {
  id: SPEED_READER_EXTENSION_ID,
  label: "Speed Reader",
  description:
    "Rapid Serial Visual Presentation reader. Speed-read notes, PDFs, OCR'd images, and web articles one word at a time.",
  iconName: "Zap",
  enabledByDefault: true,
  canDisable: true,
  navItems: [],
  surfaces: ["global-dialog"],
  settings: {
    path: "speed-reader",
    label: "Speed Reader",
    title: "Speed Reader",
    description:
      "Configure reading polish features, default WPM, font, and theme.",
    order: 80,
  },
  toolDefinitions: [
    {
      id: SPEED_READER_TOOL_ID,
      label: "Speed Read",
      iconName: "Zap",
      surfaces: ["toolbar"],
      contentTypes: ["note", "file", "external"],
      order: 120,
      group: "reading",
    },
  ],
};
