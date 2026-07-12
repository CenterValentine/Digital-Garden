import { prisma } from "@/lib/database/client";
import {
  Prisma,
  type WorkflowRun,
  type WorkflowRunEvent,
  type WorkflowRunStatus,
} from "@/lib/database/generated/prisma";
import { logger } from "@/lib/core/logger";
import { publishEvent } from "@/lib/domain/notifications/service";
import type {
  WorkflowArtifactKind,
  WorkflowGateSummary,
  WorkflowRunEventType,
  WorkflowRunWithRelations,
} from "./types";

/**
 * Inbox emission — actorType "extension" (no actorUserId) so publishEvent's
 * "never notify the actor" filter can't swallow the owner's notification.
 * Best-effort: a notification failure must never fail the run transition.
 */
async function notifyOwner(
  run: { id: string; ownerId: string },
  kind: string,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    await publishEvent(prisma, {
      kind,
      actorType: "extension",
      actorLabel: "Workflows",
      payload,
      subjectType: "workflowRun",
      subjectId: run.id,
      recipients: [{ userId: run.ownerId }],
    });
  } catch (error) {
    logger.warn({
      layer: "route",
      event: "workflows_notify:publish_failed",
      summary: error instanceof Error ? error.message : String(error),
      attrs: { runId: run.id, kind },
    });
  }
}

/**
 * Writer module — the ONLY place run state mutates. WDK steps call these
 * in-process; external engines (Plan 2) reach the same functions through
 * PAT-authed callback routes. Every writer is idempotent because durable
 * engines retry steps: a step that wrote its event and crashed before
 * acknowledging will re-run in full.
 */

const MAX_SEQ_RETRIES = 3;

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

export interface RecordEventInput {
  runId: string;
  type: WorkflowRunEventType;
  /** Deterministic idempotency key. Omit only for freeform logs. */
  key?: string;
  stepName?: string;
  payload?: Record<string, unknown>;
}

export async function recordEvent(
  input: RecordEventInput
): Promise<WorkflowRunEvent> {
  for (let attempt = 0; attempt < MAX_SEQ_RETRIES; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        if (input.key) {
          const existing = await tx.workflowRunEvent.findUnique({
            where: { runId_key: { runId: input.runId, key: input.key } },
          });
          if (existing) return existing;
        }
        const agg = await tx.workflowRunEvent.aggregate({
          where: { runId: input.runId },
          _max: { seq: true },
        });
        return tx.workflowRunEvent.create({
          data: {
            runId: input.runId,
            seq: (agg._max.seq ?? 0) + 1,
            key: input.key,
            type: input.type,
            stepName: input.stepName,
            payload: input.payload
              ? (input.payload as unknown as Prisma.InputJsonValue)
              : undefined,
          },
        });
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      if (input.key) {
        const existing = await prisma.workflowRunEvent.findUnique({
          where: { runId_key: { runId: input.runId, key: input.key } },
        });
        if (existing) return existing;
      }
      // seq collision under concurrency — retry with a fresh max(seq)
    }
  }
  throw new Error(
    `recordEvent: exhausted seq retries for run ${input.runId} (${input.type})`
  );
}

export interface CreateRunInput {
  definitionId: string;
  ownerId: string;
  engine: string;
  input: Record<string, unknown>;
}

export async function createRun(input: CreateRunInput): Promise<WorkflowRun> {
  const run = await prisma.workflowRun.create({
    data: {
      definitionId: input.definitionId,
      ownerId: input.ownerId,
      engine: input.engine,
      input: input.input as unknown as Prisma.InputJsonValue,
    },
  });
  await recordEvent({
    runId: run.id,
    type: "run.dispatched",
    key: "run:dispatched",
  });
  return run;
}

export async function markRunning(runId: string): Promise<void> {
  await prisma.workflowRun.updateMany({
    where: { id: runId, status: { in: ["queued", "waiting"] } },
    data: { status: "running", startedAt: new Date() },
  });
}

export async function setEngineRunId(
  runId: string,
  engineRunId: string
): Promise<void> {
  await prisma.workflowRun.update({
    where: { id: runId },
    data: { engineRunId },
  });
}

export async function openGate(
  runId: string,
  token: string,
  summary: WorkflowGateSummary,
  engineGateRef?: string
): Promise<void> {
  const run = await prisma.workflowRun.update({
    where: { id: runId },
    data: {
      status: "waiting",
      gateToken: token,
      engineGateRef: engineGateRef ?? null,
    },
    include: { definition: { select: { name: true } } },
  });
  await recordEvent({
    runId,
    type: "gate.opened",
    key: `${token}:opened`,
    payload: summary as unknown as Record<string, unknown>,
  });
  await notifyOwner(run, "workflow.gate", {
    runId,
    gateToken: token,
    workflowName: run.definition.name,
    title: summary.title,
    body: summary.body,
  });
}

export async function closeGate(
  runId: string,
  token: string,
  resumePayload: Record<string, unknown>
): Promise<void> {
  // "Open in chat" flows resume with the conversation used to doctor the
  // result — persist the link so the run detail can point at it.
  const conversationId =
    typeof resumePayload.conversationId === "string"
      ? resumePayload.conversationId
      : undefined;
  await prisma.workflowRun.update({
    where: { id: runId },
    data: {
      status: "running",
      gateToken: null,
      engineGateRef: null,
      ...(conversationId ? { conversationId } : {}),
    },
  });
  await recordEvent({
    runId,
    type: "gate.resumed",
    key: `${token}:resumed`,
    payload: resumePayload,
  });
}

export async function attachArtifact(
  runId: string,
  contentNodeId: string,
  kind: WorkflowArtifactKind,
  label: string
): Promise<void> {
  const existing = await prisma.workflowRunArtifact.findFirst({
    where: { runId, contentNodeId },
  });
  if (!existing) {
    await prisma.workflowRunArtifact.create({
      data: { runId, contentNodeId, kind, label },
    });
  }
  await recordEvent({
    runId,
    type: "artifact.created",
    key: `artifact:${contentNodeId}`,
    payload: { contentNodeId, kind, label },
  });
}

export interface FinishRunInput {
  status: Extract<WorkflowRunStatus, "succeeded" | "failed" | "canceled">;
  output?: Record<string, unknown>;
  error?: Record<string, unknown>;
}

export async function finishRun(
  runId: string,
  result: FinishRunInput
): Promise<void> {
  const run = await prisma.workflowRun.update({
    where: { id: runId },
    data: {
      status: result.status,
      output: result.output
        ? (result.output as unknown as Prisma.InputJsonValue)
        : undefined,
      error: result.error
        ? (result.error as unknown as Prisma.InputJsonValue)
        : undefined,
      gateToken: null,
      engineGateRef: null,
      finishedAt: new Date(),
    },
    include: { definition: { select: { name: true } } },
  });
  await recordEvent({
    runId,
    type: "run.finished",
    key: "run:finished",
    payload: { status: result.status },
  });
  await notifyOwner(run, "workflow.finished", {
    runId,
    status: result.status,
    workflowName: run.definition.name,
    title:
      result.status === "succeeded"
        ? `${run.definition.name} finished`
        : `${run.definition.name} ${result.status}`,
  });
}

export async function getRunForOwner(
  runId: string,
  ownerId: string
): Promise<WorkflowRun | null> {
  return prisma.workflowRun.findFirst({ where: { id: runId, ownerId } });
}

export async function getRunDetailForOwner(
  runId: string,
  ownerId: string
): Promise<WorkflowRunWithRelations | null> {
  return prisma.workflowRun.findFirst({
    where: { id: runId, ownerId },
    include: {
      events: { orderBy: { seq: "asc" } },
      artifacts: { orderBy: { createdAt: "asc" } },
    },
  });
}

export interface ListRunsOptions {
  status?: WorkflowRunStatus;
  limit?: number;
}

export async function listRunsForOwner(
  ownerId: string,
  options: ListRunsOptions = {}
): Promise<WorkflowRun[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  return prisma.workflowRun.findMany({
    where: { ownerId, ...(options.status ? { status: options.status } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
