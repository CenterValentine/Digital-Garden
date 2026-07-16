import { logger } from "@/lib/core/logger";

import { closeGate } from "../../runs";
import type { WorkflowEngineAdapter } from "../types";
import { n8nBaseUrl, postToN8nUrl } from "./client";

/**
 * n8n engine adapter. The compiled n8n workflow (pushed on Save) does the
 * orchestration; this adapter is the thin control surface:
 *  - start:      POST { runId, input } to the workflow's webhook to begin a run
 *                (definition.engineRef holds the webhook path).
 *  - resumeGate: POST the approval payload to the Wait-node resume URL the
 *                workflow handed us at gate-open time (run.engineGateRef).
 *  - cancel:     best-effort; the run row is finished by the caller regardless.
 *
 * Registry key "n8n" (definition.engine), distinct from the payload-level tag
 * "n8n@1" — mirrors the WDK split ("wdk" ↔ "wdk-interpreter@1").
 */
export const n8nEngineAdapter: WorkflowEngineAdapter = {
  id: "n8n",

  async start(definition, run) {
    const base = n8nBaseUrl();
    if (!base) {
      throw new Error("n8n is not configured (N8N_BASE_URL / N8N_API_KEY).");
    }
    const webhookPath = definition.engineRef;
    if (!webhookPath) {
      throw new Error(
        `Workflow "${definition.slug}" has no n8n webhook path — push it to n8n first.`
      );
    }
    const url = `${base}/webhook/${webhookPath}`;
    const { status, text } = await postToN8nUrl(url, {
      runId: run.id,
      input: (run.input ?? {}) as Record<string, unknown>,
    });
    if (status >= 400) {
      throw new Error(
        `n8n webhook returned ${status} (is the workflow active in n8n?): ${text.slice(0, 200)}`
      );
    }
    // Webhook (responseMode onReceived) doesn't hand back an execution id.
    return { engineRunId: null };
  },

  async resumeGate(run, token, payload) {
    if (!run.engineGateRef) {
      throw new Error("No engine resume handle stored for this gate.");
    }
    const { status, text } = await postToN8nUrl(run.engineGateRef, payload);
    if (status >= 400) {
      throw new Error(
        `n8n resume returned ${status}: ${text.slice(0, 200)}`
      );
    }
    // n8n accepted the resume — close the gate app-side (waiting → running)
    // now, mirroring the WDK path (wdk/gate.ts). Without this the run shows
    // "waiting" until the finish callback, however long the rest of the flow
    // takes, and a second approve click double-posts to a dead resume URL.
    await closeGate(run.id, token, payload);
  },

  async cancel(run) {
    // The n8n public API has no stop-execution endpoint; canceling is
    // best-effort and the run is finished by the caller. Log for visibility.
    logger.info({
      layer: "route",
      event: "workflows_n8n:cancel_noop",
      summary: "n8n run canceled app-side; engine execution left to complete/expire",
      attrs: { runId: run.id, engineRunId: run.engineRunId },
    });
  },
};
