import { getRun, resumeHook, start } from "workflow/api";
import { WDK_WORKFLOWS } from "../wdk/manifest";
import type { WorkflowEngineAdapter } from "./types";

/**
 * WDK adapter — in-process durable execution. start() enqueues and returns
 * immediately; the workflow's own steps flip the run to running and report
 * progress through the writer module directly (no callback transport).
 */
export const wdkEngineAdapter: WorkflowEngineAdapter = {
  id: "wdk",
  async start(definition, run) {
    const workflowFn = WDK_WORKFLOWS[definition.engineRef];
    if (!workflowFn) {
      throw new Error(
        `No WDK workflow registered for engineRef "${definition.engineRef}".`
      );
    }
    const handle = await start(workflowFn, [
      {
        runId: run.id,
        input: (run.input ?? {}) as unknown as Record<string, unknown>,
      },
    ]);
    return { engineRunId: handle.runId };
  },
  async resumeGate(_run, token, payload) {
    await resumeHook(token, payload);
  },
  async cancel(run) {
    if (!run.engineRunId) return;
    await getRun(run.engineRunId).cancel();
  },
};
