import type { ExtensionRuntime } from "@/lib/extensions/types";
import { WorkflowsPanel } from "./components/WorkflowsPanel";
import { workflowNotificationKindRenderers } from "./components/notification-renderers";
import { WORKFLOWS_EXTENSION_ID } from "./manifest";

export const workflowsExtensionRuntime: ExtensionRuntime = {
  id: WORKFLOWS_EXTENSION_ID,
  leftSidebarPanel: WorkflowsPanel,
  notificationKindRenderers: workflowNotificationKindRenderers,
};
