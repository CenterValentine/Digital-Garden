import { randomUUID } from "crypto";

import type { N8nNode, N8nWorkflow } from "./types";

/**
 * The starter n8n workflow DG seeds for a native ("n8n Flow") authoring
 * session:
 *   Webhook "Trigger" → "DG: Running" → "DG: Finish run"
 * The Trigger lets DG start runs; "DG: Running" stamps n8n's execution id onto
 * the DG run (so the error handler can map failures back); "DG: Finish run"
 * completes the run. The user builds their integration nodes in between, in
 * n8n's own editor. `settings.errorWorkflow` points at the per-user DG Error
 * Handler so a crash reports back. NOTE: the callbacks reference `$('Trigger')`
 * by name — keep the webhook trigger; don't replace it with a manual trigger.
 *
 * Node shapes match the ones validated against live n8n 2.10.2 (see compiler.ts).
 */

export interface SeedOptions {
  workflowName: string;
  callbackBaseUrl: string;
  webhookPath: string;
  credential: { id: string; name: string };
  /** Per-user DG Error Handler workflow id → n8n `settings.errorWorkflow`. */
  errorWorkflowId?: string;
}

const TRIGGER_NAME = "Trigger";
const RUNNING_NAME = "DG: Running";
const FINISH_NAME = "DG: Finish run";

// Disabled helper templates seeded below the main lane (H3). The user copies
// them into their flow; they arrive pre-wired with this flow's credential and
// callback URLs, so supervision works without hand-building HTTP nodes.
const GATE_OPEN_NAME = "DG: Open gate";
const GATE_WAIT_NAME = "DG: Wait for approval";
const EVENT_NAME = "DG: Record event";
const ARTIFACT_NAME = "DG: Attach artifact";

const HELPER_NOTE = `## DG helper nodes (templates)
These are **disabled** — copy the ones you need into your flow, connect them, then enable.

- **Open gate → Wait for approval** — pauses the run until you approve it in Digital Garden's inbox. Keep the pair connected in this order. Using several gates in one flow? Give each open-node a unique \`token\`.
- **Record event** — adds a timeline entry to the DG run (edit \`stepName\`/\`payload\`).
- **Attach artifact** — links a DG note/file/document to the run (paste its content id; \`kind\` is \`note\`, \`file\`, or \`document\`).

▶ Always run this flow from **Digital Garden's Run button** — the Trigger needs the \`runId\` DG sends. n8n's "Execute workflow" won't have one.`;

function credentials(opts: SeedOptions) {
  return { httpHeaderAuth: { id: opts.credential.id, name: opts.credential.name } };
}

function callbackUrl(opts: SeedOptions, action: string): string {
  // n8n's Webhook node nests the POST body under `.body`, so the runId DG posts
  // to the webhook lives at `$json.body.runId` (not `$json.runId`). Reading it
  // without `.body` yields undefined → the callback URL becomes `/runs//<action>`
  // → 404 → the run strands at "running".
  return `=${opts.callbackBaseUrl}/api/workflows/callback/runs/{{ $('${TRIGGER_NAME}').item.json.body.runId }}/${action}`;
}

export function buildSeedWorkflow(opts: SeedOptions): N8nWorkflow {
  const trigger: N8nNode = {
    id: randomUUID(),
    name: TRIGGER_NAME,
    type: "n8n-nodes-base.webhook",
    typeVersion: 2,
    position: [0, 0],
    parameters: {
      httpMethod: "POST",
      path: opts.webhookPath,
      responseMode: "onReceived",
    },
    webhookId: opts.webhookPath,
  };

  const running: N8nNode = {
    id: randomUUID(),
    name: RUNNING_NAME,
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.2,
    position: [240, 0],
    parameters: {
      method: "POST",
      url: callbackUrl(opts, "running"),
      sendBody: true,
      specifyBody: "json",
      jsonBody: `={{ ({ "engineExecutionId": String($execution.id) }) }}`,
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
    },
    credentials: credentials(opts),
  };

  const finish: N8nNode = {
    id: randomUUID(),
    name: FINISH_NAME,
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.2,
    position: [720, 0],
    parameters: {
      method: "POST",
      url: callbackUrl(opts, "finish"),
      sendBody: true,
      specifyBody: "json",
      jsonBody: `={{ ({ "status": "succeeded", "output": { "outcome": "completed" } }) }}`,
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
    },
    credentials: credentials(opts),
  };

  return {
    name: opts.workflowName,
    nodes: [trigger, running, finish, ...buildHelperTemplates(opts)],
    connections: {
      [TRIGGER_NAME]: { main: [[{ node: RUNNING_NAME, type: "main", index: 0 }]] },
      [RUNNING_NAME]: { main: [[{ node: FINISH_NAME, type: "main", index: 0 }]] },
      // Pre-connect the gate pair so copying both nodes carries the edge along.
      [GATE_OPEN_NAME]: { main: [[{ node: GATE_WAIT_NAME, type: "main", index: 0 }]] },
    },
    settings: opts.errorWorkflowId
      ? { errorWorkflow: opts.errorWorkflowId }
      : {},
  };
}

/**
 * The disabled helper templates parked below the main lane: a sticky note
 * explaining them, the two-node gate pair (openGate callback → Wait(webhook)
 * suspension; `$execution.resumeUrl` is the engine-side resume handle DG's
 * approve path POSTs to), a timeline-event node, and an attach-artifact node.
 * Node shapes mirror the compiler's validated builders (compiler.ts).
 */
function buildHelperTemplates(opts: SeedOptions): N8nNode[] {
  const note: N8nNode = {
    id: randomUUID(),
    name: "DG helper nodes",
    type: "n8n-nodes-base.stickyNote",
    typeVersion: 1,
    position: [-40, 240],
    parameters: { content: HELPER_NOTE, width: 560, height: 340 },
  };
  const gateOpen: N8nNode = {
    id: randomUUID(),
    name: GATE_OPEN_NAME,
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.2,
    position: [0, 640],
    disabled: true,
    parameters: {
      method: "POST",
      url: callbackUrl(opts, "gate"),
      sendBody: true,
      specifyBody: "json",
      jsonBody: `={{ ({ "token": "gate:approval", "title": "Approval needed", "body": "A step in this flow is waiting for your approval.", "engineGateRef": $execution.resumeUrl }) }}`,
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
    },
    credentials: credentials(opts),
  };
  const gateWait: N8nNode = {
    id: randomUUID(),
    name: GATE_WAIT_NAME,
    type: "n8n-nodes-base.wait",
    typeVersion: 1.1,
    position: [260, 640],
    disabled: true,
    // httpMethod MUST be POST: the Wait node registers its resume webhook for
    // GET by default, but DG's approve path (adapter.resumeGate) POSTs the
    // approval payload — a GET-only registration 404s ("no waiting webhook
    // with a matching path/method") and the approve surfaces as a 502.
    parameters: { resume: "webhook", httpMethod: "POST" },
    webhookId: randomUUID(),
  };
  const event: N8nNode = {
    id: randomUUID(),
    name: EVENT_NAME,
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.2,
    position: [0, 820],
    disabled: true,
    parameters: {
      method: "POST",
      url: callbackUrl(opts, "events"),
      sendBody: true,
      specifyBody: "json",
      jsonBody: `={{ ({ "type": "log", "stepName": "My step", "payload": { "message": "Describe what happened" } }) }}`,
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
    },
    credentials: credentials(opts),
  };
  const artifact: N8nNode = {
    id: randomUUID(),
    name: ARTIFACT_NAME,
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.2,
    position: [260, 820],
    disabled: true,
    parameters: {
      method: "POST",
      url: callbackUrl(opts, "artifacts"),
      sendBody: true,
      specifyBody: "json",
      jsonBody: `={{ ({ "contentNodeId": "PASTE_CONTENT_NODE_ID", "kind": "note", "label": "Generated note" }) }}`,
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
    },
    credentials: credentials(opts),
  };
  return [note, gateOpen, gateWait, event, artifact];
}
