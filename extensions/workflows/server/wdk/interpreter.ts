/**
 * The interpreter — ONE generic WDK workflow that executes user-authored
 * graphs as data. The graph is snapshotted into the run's input at dispatch,
 * which satisfies replay determinism AND makes in-flight runs immune to
 * live edits (append-only versioning for free).
 *
 * Division of labor (WDK sandbox rules):
 * - WORKFLOW level: pure orchestration only — graph walk, interpolation,
 *   branch evaluation (all pure client-safe modules), plus the suspension
 *   primitives (superviseGate, sleep). NEVER wrapped in try/catch around
 *   gates/sleeps — suspension may be control flow.
 * - STEP level: everything with Node/Prisma access — node executors,
 *   run-state writes. Step sections carry the failRunStep+rethrow pattern
 *   from Plan 1 so a dead step can't leave the run stuck at "running".
 */

import { sleep } from "workflow";
import { prisma } from "@/lib/database/client";
import {
  interpolateConfig,
  interpolateString,
  resolvePath,
  type InterpolationScope,
} from "../../graph/interpolate";
import { workflowGraphSchema, type WorkflowGraph, type WorkflowGraphNode } from "../../graph/schema";
import { validateGraph } from "../../graph/validate";
import { getNodeTypeMetadata } from "../../nodes/metadata";
import { getNodeExecutor } from "../../nodes/registry";
import { finishRun, markRunning, recordEvent } from "../runs";
import { superviseGate } from "./gate";
import type { WdkWorkflowInput } from "./workflows";

const MAX_NODES_PER_RUN = 200;
const TEXT_OUTPUT_CAP = 16000;
const DURATION_PATTERN = /^\d+\s*(s|m|h|d)$/;

// ---------------------------------------------------------------------------
// Steps (full Node access)
// ---------------------------------------------------------------------------

interface RunMeta {
  ownerId: string;
  workflowName: string;
}

async function loadRunMetaStep(runId: string): Promise<RunMeta> {
  "use step";
  await markRunning(runId);
  const run = await prisma.workflowRun.findUniqueOrThrow({
    where: { id: runId },
    select: { ownerId: true, definition: { select: { name: true } } },
  });
  return { ownerId: run.ownerId, workflowName: run.definition.name };
}

async function executeNodeStep(
  runId: string,
  meta: RunMeta,
  node: { id: string; type: string; label?: string },
  resolvedConfig: Record<string, unknown>,
  data: Record<string, unknown>,
  warnings: string[]
): Promise<Record<string, unknown>> {
  "use step";
  const executor = getNodeExecutor(node.type);
  if (!executor) {
    throw new Error(`No executor for node type "${node.type}".`);
  }
  const outputs = await executor(
    {
      runId,
      ownerId: meta.ownerId,
      workflowName: meta.workflowName,
      input: data,
      nodes: {},
    },
    resolvedConfig
  );
  // Pass-IDs discipline: node outputs are persisted + replayed WDK state
  // and held in the workflow-level ctx — cap free-text outputs.
  if (typeof outputs.text === "string" && outputs.text.length > TEXT_OUTPUT_CAP) {
    outputs.text = outputs.text.slice(0, TEXT_OUTPUT_CAP);
    outputs.textTruncated = true;
  }
  await recordEvent({
    runId,
    type: "step.completed",
    key: `node:${node.id}`,
    stepName: node.id,
    payload: {
      nodeType: node.type,
      label: node.label,
      outputKeys: Object.keys(outputs),
      ...(warnings.length ? { unresolvedTemplates: warnings } : {}),
    },
  });
  return outputs;
}

async function recordControlStep(
  runId: string,
  nodeId: string,
  payload: Record<string, unknown>
): Promise<void> {
  "use step";
  await recordEvent({
    runId,
    type: "step.completed",
    key: `node:${nodeId}`,
    stepName: nodeId,
    payload,
  });
}

async function succeedRunStep(
  runId: string,
  output: Record<string, unknown>
): Promise<void> {
  "use step";
  await finishRun(runId, { status: "succeeded", output });
}

async function failRunStep(runId: string, message: string): Promise<void> {
  "use step";
  await finishRun(runId, { status: "failed", error: { message } });
}

// ---------------------------------------------------------------------------
// Pure workflow-level helpers (sandbox-safe, deterministic)
// ---------------------------------------------------------------------------

function evaluateBranch(
  config: Record<string, unknown>,
  scope: InterpolationScope
): boolean {
  const path = typeof config.path === "string" ? config.path : "";
  const operator = typeof config.operator === "string" ? config.operator : "truthy";
  const compare = typeof config.value === "string" ? config.value : "";
  const value = resolvePath(scope, path);
  switch (operator) {
    case "truthy":
      return Boolean(value);
    case "equals":
      return String(value) === compare || Number(value) === Number(compare);
    case "notEquals":
      return String(value) !== compare && Number(value) !== Number(compare);
    case "gt":
      return Number(value) > Number(compare);
    case "gte":
      return Number(value) >= Number(compare);
    case "lt":
      return Number(value) < Number(compare);
    case "lte":
      return Number(value) <= Number(compare);
    case "contains":
      if (Array.isArray(value)) return value.map(String).includes(compare);
      return String(value ?? "").includes(compare);
    default:
      return false;
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  // Step errors cross the WDK boundary serialized — not Error instances.
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return "Workflow step failed.";
}

// ---------------------------------------------------------------------------
// The interpreter workflow
// ---------------------------------------------------------------------------

export async function interpreterWorkflow(wf: WdkWorkflowInput) {
  "use workflow";
  const meta = await loadRunMetaStep(wf.runId);

  // Validate the snapshot (pure + deterministic — safe at workflow level).
  const parsed = workflowGraphSchema.safeParse(wf.input.graph);
  if (!parsed.success) {
    await failRunStep(wf.runId, "Run input does not contain a valid graph snapshot.");
    throw new Error("Invalid graph snapshot");
  }
  const graph: WorkflowGraph = parsed.data;
  const structural = validateGraph(graph);
  if (!structural.valid) {
    const message = `Graph failed validation: ${structural.issues
      .slice(0, 3)
      .map((issue) => issue.message)
      .join(" ")}`;
    await failRunStep(wf.runId, message);
    throw new Error(message);
  }

  const data =
    typeof wf.input.data === "object" && wf.input.data !== null
      ? (wf.input.data as Record<string, unknown>)
      : {};
  const nodeById = new Map<string, WorkflowGraphNode>(
    graph.nodes.map((node) => [node.id, node])
  );
  const scope: InterpolationScope = { input: data, nodes: {} };

  let currentId: string | null = graph.entryNodeId;
  let executed = 0;

  while (currentId) {
    if (executed >= MAX_NODES_PER_RUN) {
      await failRunStep(wf.runId, `Run exceeded ${MAX_NODES_PER_RUN} node executions.`);
      throw new Error("Node execution cap exceeded");
    }
    executed += 1;

    const node = nodeById.get(currentId);
    if (!node) break;
    const metadata = getNodeTypeMetadata(node.type);
    if (!metadata) {
      await failRunStep(wf.runId, `Unknown node type "${node.type}" at "${node.id}".`);
      throw new Error("Unknown node type");
    }

    let branchResult: boolean | null = null;

    if (node.type === "gate") {
      // Suspension point — deliberately OUTSIDE any try/catch.
      const missing: string[] = [];
      const title =
        interpolateString(String(node.config.title ?? "Awaiting review"), scope, (p) =>
          missing.push(p)
        ) || "Awaiting review";
      const body = node.config.body
        ? interpolateString(String(node.config.body), scope, (p) => missing.push(p))
        : undefined;
      const result = await superviseGate<Record<string, unknown>>(
        wf.runId,
        node.id,
        {
          // Soak lesson: don't present confident framing over missing data.
          title: missing.length > 0 ? `⚠ ${title}` : title,
          body,
          ...(missing.length ? { data: { unresolvedTemplates: missing } } : {}),
        }
      );
      scope.nodes[node.id] = result;
    } else if (node.type === "delay") {
      const duration = String(node.config.duration ?? "");
      if (!DURATION_PATTERN.test(duration)) {
        await failRunStep(
          wf.runId,
          `Delay node "${node.id}" has an invalid duration "${duration}" (use e.g. 30m, 2h, 1d).`
        );
        throw new Error("Invalid delay duration");
      }
      await recordControlStep(wf.runId, node.id, { nodeType: "delay", duration });
      const match = duration.match(/^(\d+)\s*(s|m|h|d)$/);
      const unitMs = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[
        (match?.[2] ?? "s") as "s" | "m" | "h" | "d"
      ];
      // Suspension point — outside try/catch, costs nothing while sleeping.
      await sleep(Number(match?.[1] ?? 1) * unitMs);
      scope.nodes[node.id] = { slept: duration };
    } else if (node.type === "branch") {
      try {
        branchResult = evaluateBranch(node.config, scope);
        scope.nodes[node.id] = { result: branchResult };
        await recordControlStep(wf.runId, node.id, {
          nodeType: "branch",
          result: branchResult,
        });
      } catch (error) {
        await failRunStep(wf.runId, errorMessage(error));
        throw error;
      }
    } else {
      try {
        const warnings: string[] = [];
        const resolvedConfig = interpolateConfig(node.config, scope, (path) =>
          warnings.push(path)
        );
        scope.nodes[node.id] = await executeNodeStep(
          wf.runId,
          meta,
          { id: node.id, type: node.type, label: node.label },
          resolvedConfig,
          data,
          warnings
        );
      } catch (error) {
        await failRunStep(wf.runId, `Node "${node.label ?? node.id}": ${errorMessage(error)}`);
        throw error;
      }
    }

    // Route to the next node (validated shape: ≤1 outgoing, branch labeled).
    const outgoing = graph.edges.filter((edge) => edge.from === node.id);
    if (node.type === "branch") {
      const wanted = branchResult ? "true" : "false";
      currentId = outgoing.find((edge) => edge.branch === wanted)?.to ?? null;
    } else {
      currentId = outgoing[0]?.to ?? null;
    }
  }

  await succeedRunStep(wf.runId, { outcome: "completed", nodesExecuted: executed });
  return { outcome: "completed", nodesExecuted: executed };
}
