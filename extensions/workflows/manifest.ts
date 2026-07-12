import type { ExtensionManifest } from "@/lib/extensions/types";

export const WORKFLOWS_EXTENSION_ID = "workflows";
export const WORKFLOWS_VIEW_KEY = "workflows";

export const workflowsExtensionManifest: ExtensionManifest = {
  id: WORKFLOWS_EXTENSION_ID,
  label: "Workflows",
  description:
    "Dispatch, supervise, and review durable workflow runs with inbox-gated human approval.",
  iconName: "Workflow",
  enabledByDefault: true,
  canDisable: true,
  navItems: [
    {
      type: "view",
      view: WORKFLOWS_VIEW_KEY,
      label: "Workflows",
      title: "Workflows",
      iconName: "Workflow",
      order: 60,
    },
  ],
  surfaces: ["left-sidebar"],
};
