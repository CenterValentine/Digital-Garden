import {
  gateProbeWorkflow,
  jobApplicationWorkflow,
  type WdkWorkflowInput,
} from "./workflows";

type WdkWorkflowFunction = (input: WdkWorkflowInput) => Promise<unknown>;

/**
 * engineRef → "use workflow" function. WDK workflows are functions, not
 * URLs, so WorkflowDefinition.engineRef resolves through this map.
 * Append-only: version behavior changes as new keys ("job-application@2"),
 * never repoint a key with runs sleeping at gates.
 */
export const WDK_WORKFLOWS: Record<string, WdkWorkflowFunction> = {
  "gate-probe": gateProbeWorkflow,
  "job-application": jobApplicationWorkflow,
};
