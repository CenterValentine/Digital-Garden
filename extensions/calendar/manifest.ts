import type { ExtensionManifest } from "@/lib/extensions/types";
import { GOOGLE_CALENDAR_SCOPE } from "./server/types";

export const CALENDAR_EXTENSION_ID = "calendar";
export const CALENDAR_VIEW_KEY = "calendar";
export const CALENDAR_SETTINGS_PATH = "/settings/calendar";

export const calendarExtensionManifest: ExtensionManifest = {
  id: CALENDAR_EXTENSION_ID,
  label: "Calendar",
  description:
    "Built-in calendar extension with workspace surfaces, event flows, and embedded calendar blocks.",
  iconName: "CalendarDays",
  enabledByDefault: true,
  navItems: [
    {
      view: CALENDAR_VIEW_KEY,
      label: "Calendar",
      title: "Calendar",
      iconName: "CalendarDays",
      order: 30,
    },
  ],
  surfaces: ["left-sidebar", "main-workspace", "right-sidebar", "global-dialog"],
  settings: {
    path: CALENDAR_SETTINGS_PATH,
    label: "Calendar",
    title: "Calendar",
    description: "Manage connected calendars and in-app calendar defaults.",
    order: 70,
  },
  auth: {
    google: {
      scopes: [GOOGLE_CALENDAR_SCOPE],
      scopeTokens: ["calendar"],
      redirectPrefixes: [CALENDAR_SETTINGS_PATH],
    },
  },
  slashCommands: ["create-calendar-event", "insert-calendar-view-block"],
  editorClientExtensions: ["calendarViewBlock"],
  editorServerExtensions: ["calendarViewBlock"],
};
