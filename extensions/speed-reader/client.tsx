import type { ExtensionRuntime } from "@/lib/extensions/types";
import { SpeedReaderDialog } from "./components/SpeedReaderDialog";
import SpeedReaderSettingsDialog from "./settings/SpeedReaderSettingsDialog";
import { SPEED_READER_EXTENSION_ID } from "./manifest";

export const speedReaderExtensionRuntime: ExtensionRuntime = {
  id: SPEED_READER_EXTENSION_ID,
  globalDialogs: [SpeedReaderDialog],
  settingsDialog: SpeedReaderSettingsDialog,
};
