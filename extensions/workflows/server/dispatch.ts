import { logger } from "@/lib/core/logger";
import { prisma } from "@/lib/database/client";
import type {
  WorkflowDefinition,
  WorkflowRun,
} from "@/lib/database/generated/prisma";
import { WDK_INTERPRETER_ENGINE, workflowGraphSchema } from "../graph/schema";
import { validateGraph } from "../graph/validate";
import { ensureDefinition, getDefinitionSpec } from "./definitions";
import { getEngineAdapter } from "./engines/registry";
import {
  N8N_ADAPTER_ENGINE,
  N8N_PAYLOAD_ENGINE,
  readN8nMetadata,
} from "./engines/n8n/meta";
import { createRun, finishRun, markRunning, setEngineRunId } from "./runs";

export type DispatchErrorCode =
  | "UNKNOWN_WORKFLOW"
  | "WORKFLOW_DISABLED"
  | "VALIDATION_ERROR"
  | "ENGINE_ERROR";

/** HTTP status per dispatch failure code — shared by every dispatch route. */
export const DISPATCH_ERROR_STATUS: Record<DispatchErrorCode, number> = {
  UNKNOWN_WORKFLOW: 404,
  WORKFLOW_DISABLED: 409,
  VALIDATION_ERROR: 400,
  ENGINE_ERROR: 502,
};

export interface DispatchSuccess {
  ok: true;
  run: WorkflowRun;
}

export interface DispatchFailure {
  ok: false;
  code: DispatchErrorCode;
  message: string;
  runId?: string;
}

export type DispatchResult = DispatchSuccess | DispatchFailure;

// tsconfig has strict: false, so control-flow narrowing on `.ok` doesn't
// apply — a type predicate narrows regardless of strictNullChecks.
export function isDispatchFailure(
  result: DispatchResult
): result is DispatchFailure {
  return !result.ok;
}

/**
 * The one trigger door. App UI, the browser extension (Session 6), and any
 * future caller all dispatch through here: resolve definition → validate →
 * create the run (system of record first) → hand to the engine adapter.
 * An engine failure leaves a visible failed run, never a silent nothing.
 */
export async function dispatchWorkflow(
  ownerId: string,
  slug: string,
  input: Record<string, unknown>
): Promise<DispatchResult> {
  const definition = await ensureDefinition(ownerId, slug);
  if (!definition) {
    return {
      ok: false,
      code: "UNKNOWN_WORKFLOW",
      message: `No workflow definition for slug "${slug}".`,
    };
  }
  if (!definition.enabled) {
    return {
      ok: false,
      code: "WORKFLOW_DISABLED",
      message: `Workflow "${slug}" is disabled.`,
    };
  }

  const spec = getDefinitionSpec(slug);
  const validationError = spec?.validateInput?.(input) ?? null;
  if (validationError) {
    return { ok: false, code: "VALIDATION_ERROR", message: validationError };
  }

  let preparedInput = input;
  if (spec?.prepareInput) {
    try {
      preparedInput = await spec.prepareInput(ownerId, input);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Input preparation failed.";
      logger.error({
        layer: "route",
        event: "workflows_dispatch:prepare_input_failed",
        summary: message,
        attrs: { slug },
      });
      return { ok: false, code: "ENGINE_ERROR", message };
    }
  }

  const run = await createRun({
    definitionId: definition.id,
    ownerId,
    engine: definition.engine,
    input: preparedInput,
  });
  return startEngineForRun(definition, run);
}

/** Shared engine-start tail: adapter lookup + start with visible failure. */
async function startEngineForRun(
  definition: WorkflowDefinition,
  run: WorkflowRun
): Promise<DispatchResult> {
  const adapter = getEngineAdapter(definition.engine);
  if (!adapter) {
    const message = `No engine adapter registered for "${definition.engine}".`;
    await finishRun(run.id, { status: "failed", error: { message } });
    return { ok: false, code: "ENGINE_ERROR", message, runId: run.id };
  }
  try {
    const { engineRunId } = await adapter.start(definition, run);
    if (engineRunId) {
      await setEngineRunId(run.id, engineRunId);
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Engine start failed.";
    logger.error({
      layer: "route",
      event: "workflows_dispatch:engine_start_failed",
      summary: message,
      attrs: { runId: run.id, engine: definition.engine },
    });
    await finishRun(run.id, { status: "failed", error: { message } });
    return { ok: false, code: "ENGINE_ERROR", message, runId: run.id };
  }
  return { ok: true, run };
}

/**
 * Dispatch a user-authored workflow CONTENT NODE: load its payload, validate
 * the graph, snapshot it into the run input (in-flight runs stay immune to
 * later edits), and hand to the interpreter. The per-workflow definition row
 * is keyed by the stable content id (renames just update the display name).
 */
/**
 * Browser-extension capture entry: store the captured page as a note, then
 * dispatch the user's most recently updated enabled workflow. First capture
 * with no workflows auto-creates one from the capture-entry template — the
 * user's own editable graph from day one, no hardened recipes.
 */
export async function dispatchCaptureToUserWorkflow(
  ownerId: string,
  capture: { pageUrl?: string; pageTitle?: string; pageText?: string }
): Promise<DispatchResult> {
  const data: Record<string, unknown> = {
    ...(capture.pageUrl ? { pageUrl: capture.pageUrl } : {}),
    ...(capture.pageTitle ? { pageTitle: capture.pageTitle } : {}),
  };
  if (capture.pageText && capture.pageText.trim()) {
    const { storeCapturedPage } = await import("./documents");
    data.captureNodeId = await storeCapturedPage(ownerId, {
      pageUrl: capture.pageUrl,
      pageTitle: capture.pageTitle,
      pageText: capture.pageText,
    });
  }

  // Prefer a workflow whose page-capture trigger's URL pattern matches; fall
  // back to the most recently updated enabled workflow.
  const candidates = await prisma.contentNode.findMany({
    where: {
      ownerId,
      contentType: "workflow",
      deletedAt: null,
      workflowPayload: { enabled: true },
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, workflowPayload: { select: { definition: true } } },
  });
  let target = pickCaptureTarget(candidates, capture.pageUrl);
  if (!target) {
    const { jobApplicationGraph } = await import(
      "../graph/fixtures/job-application"
    );
    const { generateUniqueSlug } = await import("@/lib/domain/content");
    const slug = await generateUniqueSlug("Job Application Research", ownerId);
    target = await prisma.contentNode.create({
      data: {
        ownerId,
        title: "Job Application Research",
        slug,
        contentType: "workflow",
        displayOrder: 0,
        workflowPayload: {
          create: {
            engine: WDK_INTERPRETER_ENGINE,
            definition:
              jobApplicationGraph as unknown as Parameters<
                typeof prisma.workflowPayload.create
              >[0]["data"]["definition"],
            enabled: true,
          },
        },
      },
      select: { id: true },
    });
  }
  return dispatchWorkflowFromContent(ownerId, target.id, data);
}

function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .trim()
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

/**
 * Choose the capture target: among workflows whose entry is a page-capture
 * trigger, prefer one whose URL pattern matches (a specific pattern beats a
 * blank catch-all); else the first candidate (most-recently-updated). Returns
 * null when no page-capture-triggered workflow exists.
 */
function pickCaptureTarget(
  candidates: Array<{ id: string; workflowPayload: { definition: unknown } | null }>,
  pageUrl?: string
): { id: string } | null {
  let catchAll: { id: string } | null = null;
  for (const candidate of candidates) {
    const parsed = workflowGraphSchema.safeParse(
      candidate.workflowPayload?.definition
    );
    if (!parsed.success) continue;
    const graph = parsed.data;
    const entry = graph.nodes.find((n) => n.id === graph.entryNodeId);
    if (entry?.type !== "trigger-page-capture") continue;
    const patternRaw =
      typeof entry.config.urlPattern === "string" ? entry.config.urlPattern : "";
    const patterns = patternRaw
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (patterns.length === 0) {
      catchAll ??= { id: candidate.id };
      continue;
    }
    if (pageUrl && patterns.some((p) => globToRegExp(p).test(pageUrl))) {
      return { id: candidate.id }; // specific match wins immediately
    }
  }
  return catchAll;
}

export async function dispatchWorkflowFromContent(
  ownerId: string,
  contentNodeId: string,
  data: Record<string, unknown>
): Promise<DispatchResult> {
  const node = await prisma.contentNode.findFirst({
    where: {
      id: contentNodeId,
      ownerId,
      contentType: "workflow",
      deletedAt: null,
    },
    include: { workflowPayload: true },
  });
  if (!node?.workflowPayload) {
    return {
      ok: false,
      code: "UNKNOWN_WORKFLOW",
      message: "Workflow not found.",
    };
  }
  if (!node.workflowPayload.enabled) {
    return {
      ok: false,
      code: "WORKFLOW_DISABLED",
      message: "This workflow is disabled.",
    };
  }
  const parsed = workflowGraphSchema.safeParse(node.workflowPayload.definition);
  if (!parsed.success) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: `Workflow graph is invalid: ${parsed.error.issues[0]?.message ?? "schema error"}`,
    };
  }
  const structural = validateGraph(parsed.data);
  if (!structural.valid) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: `Workflow graph failed validation: ${structural.issues[0]?.message ?? ""}`,
    };
  }

  // n8n engine: the compiled workflow (pushed on Save) runs in n8n; dispatch
  // just creates the run and pokes the webhook. Run input = the dispatch data
  // (n8n receives it as { runId, input } and threads it via expressions).
  if (node.workflowPayload.engine === N8N_PAYLOAD_ENGINE) {
    const n8nMeta = readN8nMetadata(node.workflowPayload.metadata);
    if (!n8nMeta.webhookPath) {
      return {
        ok: false,
        code: "ENGINE_ERROR",
        message: "This workflow hasn't been pushed to n8n yet — save it to push.",
      };
    }
    const definition = await prisma.workflowDefinition.upsert({
      where: { ownerId_slug: { ownerId, slug: `content:${contentNodeId}` } },
      create: {
        ownerId,
        slug: `content:${contentNodeId}`,
        name: node.title,
        engine: N8N_ADAPTER_ENGINE,
        engineRef: n8nMeta.webhookPath,
      },
      update: {
        name: node.title,
        engine: N8N_ADAPTER_ENGINE,
        engineRef: n8nMeta.webhookPath,
      },
    });
    const run = await createRun({
      definitionId: definition.id,
      ownerId,
      engine: definition.engine,
      input: data,
    });
    const result = await startEngineForRun(definition, run);
    // n8n's webhook returns on receipt; if it accepted the trigger the flow is
    // executing, so reflect "running" until a callback finishes it. No-op if a
    // fast flow already fired its finish callback — markRunning only touches
    // queued/waiting runs.
    if (!isDispatchFailure(result)) {
      await markRunning(run.id);
    }
    return result;
  }

  if (node.workflowPayload.engine !== WDK_INTERPRETER_ENGINE) {
    return {
      ok: false,
      code: "ENGINE_ERROR",
      message: `Unsupported workflow engine "${node.workflowPayload.engine}".`,
    };
  }

  const definition = await prisma.workflowDefinition.upsert({
    where: { ownerId_slug: { ownerId, slug: `content:${contentNodeId}` } },
    create: {
      ownerId,
      slug: `content:${contentNodeId}`,
      name: node.title,
      engine: "wdk",
      engineRef: "interpreter",
    },
    update: { name: node.title },
  });
  const run = await createRun({
    definitionId: definition.id,
    ownerId,
    engine: definition.engine,
    input: { graph: parsed.data, data, workflowNodeId: contentNodeId },
  });
  return startEngineForRun(definition, run);
}
