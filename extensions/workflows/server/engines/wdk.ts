import type { WorkflowEngineAdapter } from "./types";

/**
 * WDK adapter — Session 1 placeholder. Session 2 wires `start` to the
 * `workflow/api` start() call resolved through a code manifest of
 * "use workflow" functions, and `resumeGate` to resumeHook(token, payload).
 * Until then, dispatched runs stay queued (the Session 1 gate condition).
 */
export const wdkEngineAdapter: WorkflowEngineAdapter = {
  id: "wdk",
  async start(_definition, _run) {
    return { engineRunId: null };
  },
  async resumeGate(_run, _token, _payload) {
    throw new Error("WDK adapter is not wired to the engine yet (Session 2).");
  },
  async cancel(_run) {
    // No engine-side execution exists yet; nothing to cancel.
  },
};
