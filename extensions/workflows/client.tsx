import type { ExtensionRuntime } from "@/lib/extensions/types";
import { WorkflowBuilder } from "./components/WorkflowBuilder";
import { WorkflowsPanel } from "./components/WorkflowsPanel";
import { workflowNotificationKindRenderers } from "./components/notification-renderers";
import WorkflowsSettingsPage from "./settings/WorkflowsSettingsPage";
import { WORKFLOWS_EXTENSION_ID } from "./manifest";

export const workflowsExtensionRuntime: ExtensionRuntime = {
  id: WORKFLOWS_EXTENSION_ID,
  leftSidebarPanel: WorkflowsPanel,
  contentViewer: WorkflowBuilder,
  matchesContentViewer: ({ contentType }) => contentType === "workflow",
  notificationKindRenderers: workflowNotificationKindRenderers,
  settingsDialog: WorkflowsSettingsPage,
};
