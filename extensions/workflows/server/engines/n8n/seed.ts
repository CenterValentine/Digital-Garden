import { randomUUID } from "crypto";

import type { N8nNode, N8nWorkflow } from "./types";

/**
 * The starter n8n workflow DG seeds for a native ("n8n Flow") authoring
 * session: a Webhook trigger (so DG can start runs) → a "DG: Finish run" node
 * (so a run always completes back in DG's timeline). The user builds their
 * integration nodes IN BETWEEN, in n8n's own editor. Optional supervision/event
 * callbacks are dropped in from the DG helper-node set.
 *
 * Node shapes match the ones validated against live n8n 2.10.2 (see compiler.ts).
 */

export interface SeedOptions {
  workflowName: string;
  callbackBaseUrl: string;
  webhookPath: string;
  credential: { id: string; name: string };
}

const TRIGGER_NAME = "Trigger";
const FINISH_NAME = "DG: Finish run";

function credentials(opts: SeedOptions) {
  return { httpHeaderAuth: { id: opts.credential.id, name: opts.credential.name } };
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

  const finish: N8nNode = {
    id: randomUUID(),
    name: FINISH_NAME,
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.2,
    position: [480, 0],
    parameters: {
      method: "POST",
      url: `=${opts.callbackBaseUrl}/api/workflows/callback/runs/{{ $('${TRIGGER_NAME}').item.json.runId }}/finish`,
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
    nodes: [trigger, finish],
    connections: {
      [TRIGGER_NAME]: { main: [[{ node: FINISH_NAME, type: "main", index: 0 }]] },
    },
    settings: {},
  };
}
