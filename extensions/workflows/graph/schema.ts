/**
 * Workflow graph model — CLIENT-SAFE (no Prisma). The single source of truth
 * for what a user-authored workflow is. The linear step-list builder and the
 * future React Flow canvas both render these nodes/edges; `position` is
 * reserved for the canvas and ignored by the list.
 *
 * Config schemas are BUILT from the field specs in nodes/metadata.ts
 * (buildConfigSchema) so the builder's forms and the server's validation
 * can never drift.
 */

import { z } from "zod";
import type { NodeConfigField } from "../nodes/metadata";

export const WORKFLOW_GRAPH_VERSION = 1;
export const WDK_INTERPRETER_ENGINE = "wdk-interpreter@1";

/** User-facing names per engine — "Trellis" is the native graph type. */
export const ENGINE_DISPLAY_NAMES: Record<string, string> = {
  [WDK_INTERPRETER_ENGINE]: "Trellis",
};

/**
 * New workflows start with a single Manual trigger — every Trellis begins
 * with its initiating connector — and nothing else. The builder invites the
 * first step after it.
 */
export function blankWorkflowGraph(): WorkflowGraph {
  return {
    version: WORKFLOW_GRAPH_VERSION,
    engine: WDK_INTERPRETER_ENGINE,
    entryNodeId: "trigger",
    nodes: [
      {
        id: "trigger",
        type: "trigger-manual",
        label: "Manual trigger",
        config: {},
      },
    ],
    edges: [],
  };
}

export const workflowGraphNodeSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/, "Node ids are alphanumeric with - or _"),
  type: z.string().min(1).max(64),
  label: z.string().max(120).optional(),
  config: z.record(z.string(), z.unknown()).default({}),
  // Canvas-only; the list renderer ignores it.
  position: z.object({ x: z.number(), y: z.number() }).optional(),
});

export const workflowGraphEdgeSchema = z.object({
  id: z.string().min(1).max(64),
  from: z.string().min(1),
  to: z.string().min(1),
  /** Only meaningful on edges leaving a branch node. */
  branch: z.enum(["true", "false"]).optional(),
});

export const workflowGraphSchema = z.object({
  version: z.literal(WORKFLOW_GRAPH_VERSION),
  engine: z.literal(WDK_INTERPRETER_ENGINE),
  // Empty string while the workflow has no steps yet.
  entryNodeId: z.string(),
  nodes: z.array(workflowGraphNodeSchema).max(100),
  edges: z.array(workflowGraphEdgeSchema).max(200),
});

export type WorkflowGraph = z.infer<typeof workflowGraphSchema>;
export type WorkflowGraphNode = z.infer<typeof workflowGraphNodeSchema>;
export type WorkflowGraphEdge = z.infer<typeof workflowGraphEdgeSchema>;

/**
 * Build a Zod schema from a node type's config field specs — one source of
 * truth for builder forms and server enforcement. Interpolated fields stay
 * plain strings ("{{research.summary}}" is valid text); numbers are never
 * interpolatable so they can validate strictly.
 */
export function buildConfigSchema(fields: NodeConfigField[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of fields) {
    let value: z.ZodTypeAny;
    switch (field.kind) {
      case "number":
        value = z.number();
        break;
      case "boolean":
        value = z.boolean();
        break;
      case "select":
        value = z.enum(
          (field.options ?? []).map((option) => option.value) as [
            string,
            ...string[],
          ]
        );
        break;
      case "json":
        value = z.record(z.string(), z.unknown());
        break;
      case "text":
      case "textarea":
      default:
        value = z.string().max(20000);
        break;
    }
    if (field.required) {
      if (field.kind === "text" || field.kind === "textarea") {
        value = (value as z.ZodString).min(1);
      }
    } else {
      value = value.optional();
    }
    shape[field.key] = value;
  }
  return z.object(shape).passthrough();
}
