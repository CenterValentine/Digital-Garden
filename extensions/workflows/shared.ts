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

/**
 * Code-defined dispatchables in the panel's Run menu. No hardened recipes —
 * user automations are workflow content nodes run from the builder; only
 * the engine plumbing test remains here.
 */
export const DISPATCHABLE_WORKFLOWS: Array<{
  slug: string;
  name: string;
  needsUrl: boolean;
}> = [{ slug: "gate-probe", name: "Gate Probe (plumbing test)", needsUrl: false }];

/**
 * The one scope a workflow service token (PAT) carries today. Execution
 * spokes (Plan 3: n8n) present this token to the callback surface. It's
 * intentionally singular — the token is "wide" but its blast radius is
 * contained structurally: requireServiceTokenAuth is imported only by the
 * /api/workflows/callback/* routes, so the token can't reach content APIs.
 */
export const WORKFLOWS_CALLBACK_SCOPE = "workflows:callback";

/**
 * Client-safe service-token record. The raw secret is NEVER in this shape —
 * only the `tokenPrefix` (first chars, for at-a-glance identification). The
 * full token is returned exactly once, at creation, in ServiceTokenCreateDto.
 */
export interface ServiceTokenDto {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}

/** Returned once, at creation: the plaintext `token` plus its record. */
export interface ServiceTokenCreateDto {
  token: string;
  record: ServiceTokenDto;
}
