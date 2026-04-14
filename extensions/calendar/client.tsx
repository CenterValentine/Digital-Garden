import { CalendarCompanionPanel } from "./components/CalendarCompanionPanel";
import { CalendarInspector } from "./components/CalendarInspector";
import { CalendarQuickAddDialog } from "./components/CalendarQuickAddDialog";
import { CalendarWorkspace } from "./components/CalendarWorkspace";
import { CalendarViewBlock } from "./editor/calendar-view-block";
import { getCalendarSlashCommands } from "./editor/slash-commands";
import { CALENDAR_EXTENSION_ID } from "./manifest";
import CalendarSettingsPage from "./settings/CalendarSettingsPage";
import type { ExtensionRuntime } from "@/lib/extensions/types";

export const calendarExtensionRuntime: ExtensionRuntime = {
  id: CALENDAR_EXTENSION_ID,
  leftSidebarPanel: CalendarCompanionPanel,
  mainWorkspace: CalendarWorkspace,
  rightSidebarPanel: CalendarInspector,
  globalDialogs: [CalendarQuickAddDialog],
  settingsDialog: CalendarSettingsPage,
  getSlashCommands: getCalendarSlashCommands,
  editorClientExtensions: [CalendarViewBlock],
};
