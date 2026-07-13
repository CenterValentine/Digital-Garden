import { createHook } from "workflow";
import { closeGate, openGate } from "../runs";
import { buildGateToken, type WorkflowGateSummary } from "../types";

async function openGateStep(
  runId: string,
  token: string,
  summary: WorkflowGateSummary
): Promise<void> {
  "use step";
  await openGate(runId, token, summary);
}

async function closeGateStep(
  runId: string,
  token: string,
  result: Record<string, unknown>
): Promise<void> {
  "use step";
  await closeGate(runId, token, result);
}

/**
 * The supervision gate — the WDK-shaped heart of human-in-the-loop.
 * Runs at WORKFLOW level (createHook cannot live inside a step); the DB
 * writes around the suspension point are steps, so the run tables always
 * agree with the engine about whether a run is waiting. Suspension is free:
 * a run can sleep here for days.
 *
 * Resumed by POST /api/workflows/runs/[id]/resume → adapter → resumeHook.
 */
export async function superviseGate<T extends Record<string, unknown>>(
  runId: string,
  gateName: string,
  summary: WorkflowGateSummary
): Promise<T> {
  const token = buildGateToken(runId, gateName);
  const hook = createHook<T>({ token });
  await openGateStep(runId, token, summary);
  const result = await hook;
  await closeGateStep(runId, token, result as Record<string, unknown>);
  return result;
}
