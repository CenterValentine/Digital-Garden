import type { ExtensionManifest } from "@/lib/extensions/types";

export const DAILY_NOTES_EXTENSION_ID = "daily-notes";
export const DAILY_NOTES_ACTION_ID = "open-periodic-note";

export const dailyNotesExtensionManifest: ExtensionManifest = {
  id: DAILY_NOTES_EXTENSION_ID,
  label: "Daily Notes",
  description:
    "Open and automatically create daily and weekly notes using page templates.",
  iconName: "CalendarCheck",
  enabledByDefault: true,
  canDisable: true,
  navItems: [
    {
      type: "action",
      id: DAILY_NOTES_ACTION_ID,
      label: "Daily Notes",
      title: "Daily Notes",
      iconName: "CalendarCheck",
      order: 10,
    },
  ],
  surfaces: ["shell"],
};
