import { WORKPLACES_EXTENSION_ID } from "./manifest";
import { WorkplacesShellController } from "./shell/WorkplacesShellController";
import { WorkplacesShellNavigationControls } from "./shell/WorkplacesShellNavigationControls";
import { WorkplacesTabMenuSection } from "./shell/WorkplacesTabMenuSection";
import WorkplacesSettingsDialog from "./settings/WorkplacesSettingsDialog";
import type { ExtensionRuntime } from "@/lib/extensions/types";

export const workplacesExtensionRuntime: ExtensionRuntime = {
  id: WORKPLACES_EXTENSION_ID,
  shellNavigationControls: [WorkplacesShellNavigationControls],
  shellControllers: [WorkplacesShellController],
  shellTabMenuSections: [WorkplacesTabMenuSection],
  settingsDialog: WorkplacesSettingsDialog,
};
