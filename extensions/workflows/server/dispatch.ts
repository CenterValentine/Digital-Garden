import { logger } from "@/lib/core/logger";
import type { WorkflowRun } from "@/lib/database/generated/prisma";
import { ensureDefinition, getDefinitionSpec } from "./definitions";
import { getEngineAdapter } from "./engines/registry";
import { createRun, finishRun, setEngineRunId } from "./runs";

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
