import { interpreterWorkflow } from "./interpreter";
import { gateProbeWorkflow, type WdkWorkflowInput } from "./workflows";

type WdkWorkflowFunction = (input: WdkWorkflowInput) => Promise<unknown>;

/**
 * engineRef → "use workflow" function. WDK workflows are functions, not
 * URLs, so WorkflowDefinition.engineRef resolves through this map.
 * Append-only: version behavior changes as new keys ("job-application@2"),
 * never repoint a key with runs sleeping at gates.
 */
// No hardened recipes: user automations run through the interpreter.
// gate-probe stays as the engine plumbing test.
export const WDK_WORKFLOWS: Record<string, WdkWorkflowFunction> = {
  "gate-probe": gateProbeWorkflow,
  interpreter: interpreterWorkflow,
};
