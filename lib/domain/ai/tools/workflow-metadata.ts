/**
 * AI Workflow Tool Metadata (Client-Safe)
 *
 * Static metadata for the Trellis workflow tools (AI v3 core S6),
 * surfaced as toggle rows in AISettingsPage. NO server-side imports —
 * the executable tools live in workflow-tools.ts (server-only).
 */

/** Workflow tool IDs */
export const WORKFLOW_TOOL_IDS = [
  "get_workflow_node_catalog",
  "list_workflows",
  "get_workflow",
  "propose_workflow",
  "update_workflow",
  "run_workflow",
] as const;

export type WorkflowToolId = (typeof WORKFLOW_TOOL_IDS)[number];

/** Tool metadata for the settings UI */
export const WORKFLOW_TOOL_METADATA: Record<
  WorkflowToolId,
  { name: string; description: string }
> = {
  get_workflow_node_catalog: {
    name: "Workflow Node Catalog",
    description:
      "Read the Trellis authoring reference (node types, config fields, outputs) before building a workflow",
  },
  list_workflows: {
    name: "List Workflows",
    description: "List your Trellis workflows with trigger and step counts",
  },
  get_workflow: {
    name: "Read Workflow",
    description:
      "Read a workflow's graph and validation status — defaults to the workflow you have open",
  },
  propose_workflow: {
    name: "Build Workflow",
    description:
      "Author a new Trellis workflow graph — you approve it in the chat, then review it on the canvas",
  },
  update_workflow: {
    name: "Update Workflow",
    description:
      "Rewrite the open (or a named) workflow's graph — you approve each change; builder-parity validation",
  },
  run_workflow: {
    name: "Run Workflow",
    description:
      "Start a run of an existing workflow — you approve each start; supervision gates pause in your inbox",
  },
};
