/**
 * Structural graph validation — CLIENT-SAFE and pure, so the builder can
 * validate inline with exactly the rules the server enforces at save and
 * dispatch time.
 *
 * v1 shape rules (linear step-list era):
 * - entry node exists; all ids unique; edges reference real nodes
 * - non-branch nodes have at most ONE outgoing edge
 * - branch nodes have a required "true" edge and an optional "false" edge
 * - no cycles; every node reachable from the entry
 * - node types exist in the palette; configs validate against field specs
 */

import { buildConfigSchema, type WorkflowGraph } from "./schema";
import { getNodeTypeMetadata } from "../nodes/metadata";

export interface GraphValidationIssue {
  nodeId?: string;
  edgeId?: string;
  message: string;
}

export interface GraphValidationResult {
  valid: boolean;
  issues: GraphValidationIssue[];
}

export function validateGraph(graph: WorkflowGraph): GraphValidationResult {
  const issues: GraphValidationIssue[] = [];
  if (graph.nodes.length === 0) {
    return {
      valid: false,
      issues: [{ message: "Add your first step to run this workflow." }],
    };
  }
  const nodeIds = new Set<string>();

  for (const node of graph.nodes) {
    if (nodeIds.has(node.id)) {
      issues.push({ nodeId: node.id, message: `Duplicate node id "${node.id}".` });
    }
    nodeIds.add(node.id);

    const metadata = getNodeTypeMetadata(node.type);
    if (!metadata) {
      issues.push({
        nodeId: node.id,
        message: `Unknown node type "${node.type}".`,
      });
      continue;
    }
    const parsed = buildConfigSchema(metadata.fields).safeParse(node.config);
    if (!parsed.success) {
      for (const issue of parsed.error.issues.slice(0, 3)) {
        issues.push({
          nodeId: node.id,
          message: `Config ${issue.path.join(".") || "value"}: ${issue.message}`,
        });
      }
    }
  }

  if (!nodeIds.has(graph.entryNodeId)) {
    issues.push({ message: `Entry node "${graph.entryNodeId}" does not exist.` });
  }

  const edgeIds = new Set<string>();
  const outgoing = new Map<string, typeof graph.edges>();
  for (const edge of graph.edges) {
    if (edgeIds.has(edge.id)) {
      issues.push({ edgeId: edge.id, message: `Duplicate edge id "${edge.id}".` });
    }
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.from)) {
      issues.push({ edgeId: edge.id, message: `Edge source "${edge.from}" does not exist.` });
      continue;
    }
    if (!nodeIds.has(edge.to)) {
      issues.push({ edgeId: edge.id, message: `Edge target "${edge.to}" does not exist.` });
      continue;
    }
    const list = outgoing.get(edge.from) ?? [];
    list.push(edge);
    outgoing.set(edge.from, list);
  }

  for (const node of graph.nodes) {
    const edges = outgoing.get(node.id) ?? [];
    if (node.type === "branch") {
      const trueEdges = edges.filter((edge) => edge.branch === "true");
      const falseEdges = edges.filter((edge) => edge.branch === "false");
      const unlabeled = edges.filter((edge) => !edge.branch);
      if (trueEdges.length !== 1) {
        issues.push({
          nodeId: node.id,
          message: "Branch nodes need exactly one edge labeled true.",
        });
      }
      if (falseEdges.length > 1 || unlabeled.length > 0) {
        issues.push({
          nodeId: node.id,
          message:
            "Branch edges must be labeled true/false (false edge optional).",
        });
      }
    } else if (edges.length > 1) {
      issues.push({
        nodeId: node.id,
        message: "Only branch nodes may have multiple outgoing edges.",
      });
    } else if (edges.some((edge) => edge.branch)) {
      issues.push({
        nodeId: node.id,
        message: "true/false edge labels are only valid on branch nodes.",
      });
    }
  }

  // Cycle detection + reachability in one DFS from the entry.
  if (nodeIds.has(graph.entryNodeId)) {
    const visited = new Set<string>();
    const inStack = new Set<string>();
    let cycle = false;
    const visit = (id: string) => {
      if (cycle) return;
      if (inStack.has(id)) {
        cycle = true;
        return;
      }
      if (visited.has(id)) return;
      visited.add(id);
      inStack.add(id);
      for (const edge of outgoing.get(id) ?? []) visit(edge.to);
      inStack.delete(id);
    };
    visit(graph.entryNodeId);
    if (cycle) {
      issues.push({ message: "Graph contains a cycle — not supported." });
    }
    for (const node of graph.nodes) {
      if (!visited.has(node.id)) {
        issues.push({
          nodeId: node.id,
          message: `Node "${node.label ?? node.id}" is unreachable from the entry.`,
        });
      }
    }
  }

  return { valid: issues.length === 0, issues };
}
