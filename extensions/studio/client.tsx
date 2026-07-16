import type { ExtensionRuntime } from "@/lib/extensions/types";
import { STUDIO_EXTENSION_ID } from "./manifest";
import { studioNotificationKindRenderers } from "./components/notification-renderers";
import StudioSettingsDialog from "./settings/StudioSettingsDialog";

/**
 * Studio client runtime.
 *
 * The Studio/Context sidebar tabs mount via the Tool Surfaces registry (not
 * this runtime); what registers here are the cross-surface contributions —
 * the inbox renderer for "studio.run" notifications (Phase 5) and the
 * settings dialog (settings page + Extensions-rail tile).
 */
export const studioExtensionRuntime: ExtensionRuntime = {
  id: STUDIO_EXTENSION_ID,
  notificationKindRenderers: studioNotificationKindRenderers,
  settingsDialog: StudioSettingsDialog,
};
