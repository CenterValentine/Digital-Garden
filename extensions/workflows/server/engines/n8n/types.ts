/**
 * n8n workflow JSON shape (the compile target) + REST client response shapes.
 * Kept minimal — only the fields the compiler emits and the adapter reads.
 * n8n ignores unknown fields on create, so we send a lean workflow.
 */

/** A node in an n8n workflow. `type` is a node-type id like "n8n-nodes-base.httpRequest". */
export interface N8nNode {
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  parameters: Record<string, unknown>;
  credentials?: Record<string, { id: string; name: string }>;
  disabled?: boolean;
  webhookId?: string;
}

/** One end of a wire: into `node`'s `type` input at `index`. */
export interface N8nConnectionTarget {
  node: string;
  type: "main";
  index: number;
}

/**
 * Connections are keyed by SOURCE NODE NAME (not id). `main[outputIndex]` is an
 * array of targets fanning out from that output. IF nodes use output 0 = true,
 * 1 = false.
 */
export type N8nConnections = Record<string, { main: N8nConnectionTarget[][] }>;

/** The workflow payload we POST/PUT to n8n's REST API. */
export interface N8nWorkflow {
  name: string;
  nodes: N8nNode[];
  connections: N8nConnections;
  settings: Record<string, unknown>;
}

/** Slim view returned by list/get/create. */
export interface N8nWorkflowSummary {
  id: string;
  name: string;
  active: boolean;
}

export interface N8nExecutionSummary {
  id: string;
  finished: boolean;
  status?: string;
  stoppedAt?: string | null;
}
