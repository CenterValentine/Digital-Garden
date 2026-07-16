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
    nodes: [trigger, running, finish],
    connections: {
      [TRIGGER_NAME]: { main: [[{ node: RUNNING_NAME, type: "main", index: 0 }]] },
      [RUNNING_NAME]: { main: [[{ node: FINISH_NAME, type: "main", index: 0 }]] },
    },
    settings: opts.errorWorkflowId
      ? { errorWorkflow: opts.errorWorkflowId }
      : {},
  };
}
