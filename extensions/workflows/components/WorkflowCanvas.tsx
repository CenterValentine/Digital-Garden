"use client";

/**
 * React Flow canvas view — the second renderer over the same graph model
 * the step list edits. Scope (deliberate): pan/zoom/minimap, drag nodes to
 * persist `position`, click a node to edit its config in the side panel.
 * Structural edits (add/remove/rewire) stay in the list view for now.
 *
 * The default React Flow attribution stays visible — policy per the plan's
 * licensing appendix.
 */

import { useCallback, useMemo, useState } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Sparkles, X } from "lucide-react";
import { deriveChain } from "../graph/chain";
import type { WorkflowGraph, WorkflowGraphNode } from "../graph/schema";
import { getNodeTypeMetadata } from "../nodes/metadata";
import { ConfigField, NODE_ICONS } from "./WorkflowBuilder";

type CanvasNodeData = {
  label: string;
  typeLabel: string;
  nodeType: string;
  [key: string]: unknown;
};

function CanvasNode({ data, selected }: NodeProps) {
  const nodeData = data as CanvasNodeData;
  const Icon = NODE_ICONS[nodeData.nodeType] ?? Sparkles;
  return (
    <div
      className={`min-w-[150px] rounded-lg border bg-white px-3 py-2 shadow-sm dark:bg-gray-900 ${
        selected
          ? "border-gold-primary ring-1 ring-gold-primary/50"
          : "border-black/15 dark:border-white/20"
      }`}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 shrink-0 text-gold-primary" />
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-gray-900 dark:text-gray-100">
            {nodeData.label}
          </p>
          <p className="text-[10px] text-gray-400 dark:text-gray-500">
            {nodeData.typeLabel}
          </p>
        </div>
      </div>
    </div>
  );
}

const NODE_TYPES = { workflowNode: CanvasNode };

export function WorkflowCanvas({
  graph,
  onPositionChange,
  onNodeConfigChange,
}: {
  graph: WorkflowGraph;
  onPositionChange: (nodeId: string, position: { x: number; y: number }) => void;
  onNodeConfigChange: (nodeId: string, patch: Partial<WorkflowGraphNode>) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const flowNodes: Node[] = useMemo(() => {
    const { order } = deriveChain(graph);
    const indexOf = new Map(order.map((id, index) => [id, index]));
    return graph.nodes.map((node) => ({
      id: node.id,
      type: "workflowNode",
      position:
        node.position ?? {
          x: 80 + ((indexOf.get(node.id) ?? 0) % 2) * 40,
          y: 40 + (indexOf.get(node.id) ?? 0) * 100,
        },
      data: {
        label: node.label ?? getNodeTypeMetadata(node.type)?.label ?? node.type,
        typeLabel: getNodeTypeMetadata(node.type)?.label ?? node.type,
        nodeType: node.type,
      } satisfies CanvasNodeData,
    }));
  }, [graph]);

  const flowEdges: Edge[] = useMemo(
    () =>
      graph.edges.map((edge) => ({
        id: edge.id,
        source: edge.from,
        target: edge.to,
        label: edge.branch,
        animated: edge.branch === "true",
      })),
    [graph]
  );

  const selectedNode = graph.nodes.find((node) => node.id === selectedId);
  const selectedMetadata = selectedNode
    ? getNodeTypeMetadata(selectedNode.type)
    : null;

  const handleDragStop = useCallback(
    (_event: unknown, node: Node) => {
      onPositionChange(node.id, {
        x: Math.round(node.position.x),
        y: Math.round(node.position.y),
      });
    },
    [onPositionChange]
  );

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={NODE_TYPES}
        onNodeDragStop={handleDragStop}
        onNodeClick={(_event, node) => setSelectedId(node.id)}
        onPaneClick={() => setSelectedId(null)}
        fitView
        proOptions={{ hideAttribution: false }}
        nodesConnectable={false}
        deleteKeyCode={null}
      >
        <Background gap={16} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable className="!h-24 !w-36" />
      </ReactFlow>

      {selectedNode ? (
        <div className="absolute right-2 top-2 z-10 max-h-[calc(100%-1rem)] w-72 overflow-y-auto rounded-lg border border-black/10 bg-white/95 p-3 shadow-lg backdrop-blur dark:border-white/15 dark:bg-gray-950/95">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">
              {selectedNode.label ?? selectedMetadata?.label ?? selectedNode.type}
            </p>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="rounded p-0.5 text-gray-400 hover:bg-black/5 hover:text-gray-700 dark:hover:bg-white/10"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="space-y-2">
            <ConfigField
              field={{ key: "__label", label: "Step name", kind: "text" }}
              value={selectedNode.label ?? ""}
              onChange={(value) =>
                onNodeConfigChange(selectedNode.id, {
                  label: typeof value === "string" ? value : undefined,
                })
              }
            />
            {(selectedMetadata?.fields ?? []).map((field) => (
              <ConfigField
                key={field.key}
                field={field}
                value={selectedNode.config[field.key]}
                onChange={(value) =>
                  onNodeConfigChange(selectedNode.id, {
                    config: { ...selectedNode.config, [field.key]: value },
                  })
                }
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
