/**
 * Chain derivation — CLIENT-SAFE. Shared by the step-list builder (editing)
 * and the run-detail snapshot view (display). The supported v1 shape is a
 * chain where branch nodes continue along their true edge; anything richer
 * is flagged `simple: false` (renderable, not list-editable).
 */

import type { WorkflowGraph, WorkflowGraphNode } from "./schema";

export interface ChainResult {
  order: string[];
  /** True when the graph is exactly a supported chain (structural edits allowed). */
  simple: boolean;
}

export function deriveChain(graph: WorkflowGraph): ChainResult {
  const order: string[] = [];
  const seen = new Set<string>();
  let simple = true;
  let currentId: string | null = graph.entryNodeId;
  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    order.push(currentId);
    const node = graph.nodes.find((n) => n.id === currentId);
    const outgoing = graph.edges.filter((e) => e.from === currentId);
    if (!node) break;
    if (node.type === "branch") {
      if (outgoing.some((e) => e.branch === "false")) simple = false;
      currentId = outgoing.find((e) => e.branch === "true")?.to ?? null;
    } else {
      if (outgoing.length > 1) simple = false;
      currentId = outgoing[0]?.to ?? null;
    }
  }
  if (seen.size !== graph.nodes.length) simple = false;
  return { order, simple };
}

/** Rebuild edges from a chain order (branch nodes get a labeled true edge). */
export function edgesFromChain(
  order: string[],
  nodes: WorkflowGraphNode[]
): WorkflowGraph["edges"] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges: WorkflowGraph["edges"] = [];
  for (let i = 0; i < order.length - 1; i++) {
    const from = order[i];
    const isBranch = byId.get(from)?.type === "branch";
    edges.push({
      id: `e-${from}-${order[i + 1]}`,
      from,
      to: order[i + 1],
      ...(isBranch ? { branch: "true" as const } : {}),
    });
  }
  return edges;
}
