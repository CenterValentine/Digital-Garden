import type { ExtensionManifest } from "@/lib/extensions/types";

export const WORKFLOWS_EXTENSION_ID = "workflows";

export const workflowsExtensionManifest: ExtensionManifest = {
  id: WORKFLOWS_EXTENSION_ID,
  label: "Workflows",
  description:
    "Dispatch, supervise, and review durable workflow runs with inbox-gated human approval.",
  iconName: "Workflow",
  // Flips to true when Session 4 ships the run list/detail UI — until then
  // there is no user-facing surface to enable.
  enabledByDefault: false,
  canDisable: true,
  navItems: [],
  surfaces: [],
};
