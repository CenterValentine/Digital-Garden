import { prisma } from "@/lib/database/client";
import type { WorkflowDefinition } from "@/lib/database/generated/prisma";

/**
 * Code manifest of first-party workflow definitions — the source of truth
 * for what exists. DB rows are seeded from these specs at dispatch time and
 * carry user-facing config (enabled, engine choice). Append-only versioning:
 * ship behavior changes as a new slug (e.g. "job-application@2") — never
 * repoint a slug with live runs sleeping at gates.
 */
export interface WorkflowDefinitionSpec {
  slug: string;
  name: string;
  engine: string;
  engineRef: string;
  /** Returns an error message, or null when the input is acceptable. */
  validateInput?: (input: Record<string, unknown>) => string | null;
}

export const WORKFLOW_DEFINITION_SPECS: WorkflowDefinitionSpec[] = [
  {
    slug: "gate-probe",
    name: "Gate Probe (WDK plumbing test)",
    engine: "wdk",
    engineRef: "gate-probe",
  },
  {
    slug: "job-application",
    name: "Job Application Research",
    engine: "wdk",
    engineRef: "job-application",
    validateInput: (input) => {
      if (
        typeof input.pageUrl !== "string" &&
        typeof input.pageText !== "string"
      ) {
        return "Input requires a pageUrl or pageText string.";
      }
      return null;
    },
  },
];

export function getDefinitionSpec(
  slug: string
): WorkflowDefinitionSpec | null {
  return WORKFLOW_DEFINITION_SPECS.find((spec) => spec.slug === slug) ?? null;
}

/** Upsert the per-owner DB row for a code-manifest spec. */
export async function ensureDefinition(
  ownerId: string,
  slug: string
): Promise<WorkflowDefinition | null> {
  const spec = getDefinitionSpec(slug);
  if (!spec) return null;
  return prisma.workflowDefinition.upsert({
    where: { ownerId_slug: { ownerId, slug } },
    create: {
      ownerId,
      slug: spec.slug,
      name: spec.name,
      engine: spec.engine,
      engineRef: spec.engineRef,
    },
    // Keep name/engineRef synced to code; never touch user-facing config
    // (enabled, future engine choice) on re-dispatch.
    update: { name: spec.name, engineRef: spec.engineRef },
  });
}
