import { DAILY_NOTES_ACTION_ID, DAILY_NOTES_EXTENSION_ID } from "./manifest";
import { PeriodicNotesHeaderAction } from "./components/PeriodicNotesHeaderAction";
import { PeriodicNotesShellController } from "./components/PeriodicNotesShellController";
import PeriodicNotesSettingsDialog from "./settings/PeriodicNotesSettingsDialog";
import type { ExtensionRuntime } from "@/lib/extensions/types";

export const dailyNotesExtensionRuntime: ExtensionRuntime = {
  id: DAILY_NOTES_EXTENSION_ID,
  headerNavActions: {
    [DAILY_NOTES_ACTION_ID]: PeriodicNotesHeaderAction,
  },
  shellControllers: [PeriodicNotesShellController],
  settingsDialog: PeriodicNotesSettingsDialog,
};
