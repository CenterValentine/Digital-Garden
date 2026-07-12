import { wdkEngineAdapter } from "./wdk";
import type { WorkflowEngineAdapter } from "./types";

/**
 * Server-only engine registry (imports Prisma types transitively — never
 * import from "use client" components; mirrors the AI tools registry split).
 * "User chooses their engine" is a dropdown over these keys.
 */
const ENGINE_REGISTRY: Record<string, WorkflowEngineAdapter> = {
  [wdkEngineAdapter.id]: wdkEngineAdapter,
};

export function getEngineAdapter(id: string): WorkflowEngineAdapter | null {
  return ENGINE_REGISTRY[id] ?? null;
}

export function listEngineAdapters(): WorkflowEngineAdapter[] {
  return Object.values(ENGINE_REGISTRY);
}
