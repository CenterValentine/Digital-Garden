import { finishRun, markRunning, recordEvent } from "../runs";
import { superviseGate } from "./gate";

/** Every WDK workflow receives the app-side run id plus the dispatch input. */
export interface WdkWorkflowInput {
  runId: string;
  input: Record<string, unknown>;
}

async function beginRunStep(runId: string): Promise<void> {
  "use step";
  await markRunning(runId);
}

async function probeWorkStep(runId: string): Promise<void> {
  "use step";
  await recordEvent({
    runId,
    type: "step.completed",
    key: "step:probe-work",
    stepName: "probe-work",
    payload: { note: "pre-gate work done" },
  });
}

async function succeedRunStep(
  runId: string,
  output: Record<string, unknown>
): Promise<void> {
  "use step";
  await finishRun(runId, { status: "succeeded", output });
}

/**
 * Session 2 plumbing proof: two steps around one supervision gate.
 * NOTE: no workflow-level try/catch — replay engines can implement
 * suspension as control flow, and a broad catch risks swallowing it.
 * Failure marking lives in steps and the dispatch service.
 */
export async function gateProbeWorkflow(input: WdkWorkflowInput) {
  "use workflow";
  await beginRunStep(input.runId);
  await probeWorkStep(input.runId);
  const review = await superviseGate<{ approved?: boolean }>(
    input.runId,
    "probe",
    {
      title: "Gate probe awaiting approval",
      body: "Resume via POST /api/workflows/runs/{id}/resume with the gate token.",
    }
  );
  const approved = review.approved === true;
  await succeedRunStep(input.runId, { approved });
  return { approved };
}
