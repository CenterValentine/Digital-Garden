import type {
  WorkflowRun,
  WorkflowRunArtifact,
  WorkflowRunEvent,
} from "@/lib/database/generated/prisma";

/**
 * Event vocabulary for the run timeline. Stored as free text in Postgres;
 * this union is the source of truth for what the app emits and the UI
 * renders. External engines (Plan 2) must map into this vocabulary too.
 */
export type WorkflowRunEventType =
  | "run.dispatched"
  | "step.started"
  | "step.completed"
  | "gate.opened"
  | "gate.resumed"
  | "artifact.created"
  | "run.finished"
  | "log";

export type WorkflowArtifactKind = "document" | "note" | "file";

/** Payload attached to a gate.opened event and surfaced by the inbox card. */
export interface WorkflowGateSummary {
  title: string;
  body?: string;
  data?: Record<string, unknown>;
}

export type WorkflowRunWithRelations = WorkflowRun & {
  events: WorkflowRunEvent[];
  artifacts: WorkflowRunArtifact[];
};

export const TERMINAL_RUN_STATUSES = [
  "succeeded",
  "failed",
  "canceled",
] as const;

export function isTerminalStatus(status: string): boolean {
  return (TERMINAL_RUN_STATUSES as readonly string[]).includes(status);
}

/** Deterministic gate token — derivable by inbox actions without lookups. */
export function buildGateToken(runId: string, gateName: string): string {
  return `gate:${runId}:${gateName}`;
}
