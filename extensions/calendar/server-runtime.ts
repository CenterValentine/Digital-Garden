import { ServerCalendarViewBlock } from "./editor/calendar-view-block";
import { CALENDAR_EXTENSION_ID } from "./manifest";
import type { ExtensionServerRuntime } from "@/lib/extensions/types";

export const calendarExtensionServerRuntime: ExtensionServerRuntime = {
  id: CALENDAR_EXTENSION_ID,
  editorServerExtensions: [ServerCalendarViewBlock],
};
