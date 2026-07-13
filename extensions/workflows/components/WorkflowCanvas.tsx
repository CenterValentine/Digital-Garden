"use client";

/**
 * React Flow canvas view — the second renderer over the same graph model
 * the step list edits. Pan/zoom/minimap, drag nodes to persist `position`,
 * click a node to edit its config, click the + on an edge (or the Add step
 * panel) to insert steps. Rewiring by dragging connections is not enabled;
 * the chain model owns edge structure.
 *
 * The default React Flow attribution stays visible — policy per the plan's
 * licensing appendix.
 */

import { useCallback, useMemo, useState } from "react";
import {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  getSmoothStepPath,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Plus, Sparkles, X } from "lucide-react";
import { deriveChain } from "../graph/chain";
import type { WorkflowGraph, WorkflowGraphNode } from "../graph/schema";
import { getNodeTypeMetadata, NODE_TYPE_METADATA } from "../nodes/metadata";
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
      {/* Handles anchor the edges — without them React Flow draws nothing. */}
      <Handle
        type="target"
        position={Position.Top}
        className="!h-1.5 !w-1.5 !border-0 !bg-gray-400 dark:!bg-gray-500"
        isConnectable={false}
      />
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
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-1.5 !w-1.5 !border-0 !bg-gray-400 dark:!bg-gray-500"
        isConnectable={false}
      />
    </div>
  );
}

/** Edge with a midpoint + button for inserting a step between two nodes. */
function InsertableEdge(props: EdgeProps) {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
  });
  const onInsert = (props.data as { onInsert?: () => void } | undefined)
    ?.onInsert;
  return (
    <>
      <BaseEdge id={props.id} path={path} markerEnd={props.markerEnd} />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan pointer-events-auto absolute flex flex-col items-center gap-0.5"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
        >
          {props.label ? (
            <span className="rounded bg-gray-100 px-1 text-[9px] text-gray-500 dark:bg-gray-800 dark:text-gray-400">
              {props.label}
            </span>
          ) : null}
          {onInsert ? (
            <button
              type="button"
              title="Insert step here"
              onClick={onInsert}
              className="flex h-4 w-4 items-center justify-center rounded-full border border-black/20 bg-white text-gray-500 shadow-sm hover:border-gold-primary hover:text-gold-primary dark:border-white/25 dark:bg-gray-900 dark:text-gray-400"
            >
              <Plus className="h-2.5 w-2.5" />
            </button>
          ) : null}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const NODE_TYPES = { workflowNode: CanvasNode };
const EDGE_TYPES = { insertable: InsertableEdge };

export function WorkflowCanvas({
  graph,
  structureEditable,
  onPositionChange,
  onNodeConfigChange,
  onInsertAfter,
}: {
  graph: WorkflowGraph;
  /** False for graphs beyond the supported chain shape (config-only mode). */
  structureEditable: boolean;
  onPositionChange: (nodeId: string, position: { x: number; y: number }) => void;
  onNodeConfigChange: (nodeId: string, patch: Partial<WorkflowGraphNode>) => void;
  /** Insert a new node after `afterId` (null = as the first/only step). */
  onInsertAfter: (afterId: string | null, type: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingInsert, setPendingInsert] = useState<
    { afterId: string | null } | null
  >(null);

  const chain = useMemo(() => deriveChain(graph), [graph]);
  const lastChainNodeId = chain.order[chain.order.length - 1] ?? null;

  const flowNodes: Node[] = useMemo(() => {
    const indexOf = new Map(chain.order.map((id, index) => [id, index]));
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
  }, [graph, chain]);

  const flowEdges: Edge[] = useMemo(
    () =>
      graph.edges.map((edge) => ({
        id: edge.id,
        source: edge.from,
        target: edge.to,
        type: "insertable",
        label: edge.branch,
        animated: edge.branch === "true",
        data: structureEditable
          ? { onInsert: () => setPendingInsert({ afterId: edge.from }) }
          : {},
      })),
    [graph, structureEditable]
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
        edgeTypes={EDGE_TYPES}
        onNodeDragStop={handleDragStop}
        onNodeClick={(_event, node) => setSelectedId(node.id)}
        onPaneClick={() => {
          setSelectedId(null);
          setPendingInsert(null);
        }}
        fitView
        proOptions={{ hideAttribution: false }}
        nodesConnectable={false}
        deleteKeyCode={null}
      >
        <Background gap={16} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable className="!h-24 !w-36" />
        {structureEditable ? (
          <Panel position="top-left">
            <button
              type="button"
              onClick={() => setPendingInsert({ afterId: lastChainNodeId })}
              className="inline-flex items-center gap-1 rounded-md border border-dashed border-black/20 bg-white/90 px-2 py-1 text-[11px] text-gray-600 shadow-sm hover:border-gold-primary hover:text-gold-primary dark:border-white/25 dark:bg-gray-900/90 dark:text-gray-300"
            >
              <Plus className="h-3 w-3" /> Add step
            </button>
          </Panel>
        ) : null}
      </ReactFlow>

      {pendingInsert ? (
        <div className="absolute left-1/2 top-10 z-20 w-64 -translate-x-1/2 rounded-md border border-black/10 bg-white p-1 shadow-lg dark:border-white/15 dark:bg-gray-900">
          <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            Insert step
          </p>
          {NODE_TYPE_METADATA.map((meta) => {
            const Icon = NODE_ICONS[meta.id] ?? Sparkles;
            return (
              <button
                key={meta.id}
                type="button"
                onClick={() => {
                  onInsertAfter(pendingInsert.afterId, meta.id);
                  setPendingInsert(null);
                }}
                className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/10"
              >
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold-primary" />
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-gray-900 dark:text-gray-100">
                    {meta.label}
                  </span>
                  <span className="block truncate text-[10px] text-gray-500 dark:text-gray-400">
                    {meta.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

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
