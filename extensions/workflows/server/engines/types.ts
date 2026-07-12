import type {
  WorkflowDefinition,
  WorkflowRun,
} from "@/lib/database/generated/prisma";

/**
 * The four-verb engine contract. Any durable execution engine plugs in by
 * implementing this — WDK in-process, n8n over webhooks (Plan 2), Hatchet
 * via SDK (Plan 3). Adapters map engine-native state into the app's
 * vocabulary; nothing engine-specific leaks past this interface.
 */
export interface WorkflowEngineAdapter {
  /** Registry key — matches WorkflowDefinition.engine / WorkflowRun.engine. */
  id: string;
  /**
   * Verb 1: begin execution for an already-created run. Returns the
   * engine-side handle (or null when the engine has none to offer yet).
   * Must NOT create or mutate run rows — the dispatch service owns that.
   */
  start(
    definition: WorkflowDefinition,
    run: WorkflowRun
  ): Promise<{ engineRunId: string | null }>;
  /**
   * Verb 3: deliver a gate resolution to a suspended execution. The route
   * has already verified ownership, waiting status, and token match.
   */
  resumeGate(
    run: WorkflowRun,
    token: string,
    payload: Record<string, unknown>
  ): Promise<void>;
  /** Engine-side cancellation (best-effort). Run rows are finished by the caller. */
  cancel(run: WorkflowRun): Promise<void>;
}
