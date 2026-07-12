/**
 * Client-safe workflow types — NO Prisma imports (this file is consumed by
 * "use client" components). Shapes mirror the JSON returned by
 * /api/workflows/* routes; dates arrive as ISO strings.
 */

export const WORKFLOW_RUN_STATUSES = [
  "queued",
  "running",
  "waiting",
  "succeeded",
  "failed",
  "canceled",
] as const;

export type WorkflowRunStatusValue = (typeof WORKFLOW_RUN_STATUSES)[number];

export const TERMINAL_STATUSES: readonly WorkflowRunStatusValue[] = [
  "succeeded",
  "failed",
  "canceled",
];

export function isTerminal(status: string): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

export interface WorkflowRunEventDto {
  id: string;
  seq: number;
  type: string;
  stepName: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

export interface WorkflowRunArtifactDto {
  id: string;
  contentNodeId: string;
  kind: string;
  label: string;
}

export interface WorkflowRunDto {
  id: string;
  status: WorkflowRunStatusValue;
  engine: string;
  gateToken: string | null;
  conversationId: string | null;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  definition: { slug: string; name: string };
  events?: WorkflowRunEventDto[];
  artifacts?: WorkflowRunArtifactDto[];
}

/** Dispatchable definitions surfaced in the panel's Run menu. */
export const DISPATCHABLE_WORKFLOWS: Array<{
  slug: string;
  name: string;
  needsUrl: boolean;
}> = [
  { slug: "job-application", name: "Job Application Research", needsUrl: true },
  { slug: "gate-probe", name: "Gate Probe (plumbing test)", needsUrl: false },
];
