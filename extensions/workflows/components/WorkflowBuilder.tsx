"use client";

/**
 * Linear step-list workflow builder — the content viewer for
 * contentType "workflow". Renders the graph as an ordered chain
 * (branch nodes continue along their true edge; a false edge ending the
 * run is the supported v1 shape). Graphs with richer branching drop to
 * config-only mode rather than risking a destructive rewrite.
 *
 * The graph model is canvas-ready: this component is one renderer over
 * nodes/edges; the React Flow canvas is another.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Bell,
  ChevronDown,
  ChevronRight,
  Clock,
  FileOutput,
  FileText,
  FilePlus,
  GitBranch,
  Globe,
  Loader2,
  Play,
  Plus,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Waypoints,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import type { ExtensionContentViewerProps } from "@/lib/extensions/types";
import {
  NODE_TYPE_METADATA,
  type NodeConfigField,
} from "../nodes/metadata";
import {
  TRIGGER_TYPE_METADATA,
  getAnyNodeMetadata,
  isTriggerType,
  parseManualInputFields,
} from "../nodes/triggers";
import type {
  WorkflowGraph,
  WorkflowGraphNode,
} from "../graph/schema";
import { deriveChain, edgesFromChain } from "../graph/chain";
import { ENGINE_DISPLAY_NAMES } from "../graph/schema";
import { N8nFlowView } from "./N8nFlowView";
import { validateGraph, type GraphValidationIssue } from "../graph/validate";
import { WorkflowCanvas } from "./WorkflowCanvas";

export const NODE_ICONS: Record<string, typeof Sparkles> = {
  "ai-complete": Sparkles,
  gate: ShieldCheck,
  branch: GitBranch,
  delay: Clock,
  "fetch-url": Globe,
  "http-request": Send,
  "get-content": FileText,
  "store-content": FilePlus,
  "export-docx": FileOutput,
  notify: Bell,
  "call-workflow": Waypoints,
  "trigger-manual": Play,
  "trigger-page-capture": Globe,
  "trigger-called": Waypoints,
  "trigger-content-event": FileText,
  "trigger-schedule": Clock,
  "trigger-periodic-note": Clock,
  "trigger-calendar-event": Clock,
  "trigger-activity-event": Bell,
};

function uniqueNodeId(type: string, nodes: WorkflowGraphNode[]): string {
  const existing = new Set(nodes.map((n) => n.id));
  let counter = 1;
  while (existing.has(`${type}-${counter}`)) counter += 1;
  return `${type}-${counter}`;
}

export function ConfigField({
  field,
  value,
  onChange,
}: {
  field: NodeConfigField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const inputClass =
    "w-full rounded-md border border-black/15 bg-white px-2 py-1.5 text-xs text-gray-900 dark:border-white/20 dark:bg-gray-900 dark:text-gray-100 focus:border-gold-primary outline-none";
  const [jsonDraft, setJsonDraft] = useState<string | null>(null);

  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-gray-600 dark:text-gray-300">
        {field.label}
        {field.required ? <span className="text-red-500"> *</span> : null}
        {field.interpolated ? (
          <span
            className="ml-1 text-[10px] text-gray-400"
            title="Supports {{input.path}} and {{nodeId.path}} templates"
          >
            {"{{ }}"}
          </span>
        ) : null}
      </span>
      {field.kind === "textarea" ? (
        <textarea
          className={`${inputClass} min-h-[64px] font-mono`}
          value={typeof value === "string" ? value : ""}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : field.kind === "number" ? (
        <input
          type="number"
          className={inputClass}
          value={typeof value === "number" ? value : ""}
          onChange={(e) =>
            onChange(e.target.value === "" ? undefined : Number(e.target.value))
          }
        />
      ) : field.kind === "boolean" ? (
        <input
          type="checkbox"
          className="h-4 w-4 accent-gold-primary"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked || undefined)}
        />
      ) : field.kind === "select" ? (
        <select
          className={inputClass}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || undefined)}
        >
          <option value="">—</option>
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : field.kind === "json" ? (
        <textarea
          className={`${inputClass} min-h-[48px] font-mono`}
          value={jsonDraft ?? (value ? JSON.stringify(value, null, 2) : "")}
          placeholder='{"Authorization": "Bearer …"}'
          onChange={(e) => setJsonDraft(e.target.value)}
          onBlur={() => {
            if (jsonDraft === null) return;
            if (jsonDraft.trim() === "") {
              onChange(undefined);
              setJsonDraft(null);
              return;
            }
            try {
              onChange(JSON.parse(jsonDraft));
              setJsonDraft(null);
            } catch {
              toast.error(`${field.label}: invalid JSON`);
            }
          }}
        />
      ) : (
        <input
          type="text"
          className={inputClass}
          value={typeof value === "string" ? value : ""}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {field.help ? (
        <span className="mt-0.5 block text-[10px] text-gray-400 dark:text-gray-500">
          {field.help}
        </span>
      ) : null}
    </label>
  );
}

function AddNodeMenu({ onAdd }: { onAdd: (type: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex justify-center py-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-full border border-dashed border-black/20 px-2 py-0.5 text-[11px] text-gray-500 hover:border-gold-primary hover:text-gold-primary dark:border-white/20 dark:text-gray-400"
      >
        <Plus className="h-3 w-3" /> Add step
      </button>
      {open ? (
        <div className="absolute top-7 z-30 w-64 rounded-md border border-black/10 bg-white p-1 shadow-lg dark:border-white/15 dark:bg-gray-900">
          {NODE_TYPE_METADATA.map((meta) => {
            const Icon = NODE_ICONS[meta.id] ?? Sparkles;
            return (
              <button
                key={meta.id}
                type="button"
                onClick={() => {
                  onAdd(meta.id);
                  setOpen(false);
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
    </div>
  );
}

export function WorkflowBuilder({
  selectedContentId,
}: ExtensionContentViewerProps) {
  const [title, setTitle] = useState("");
  const [graph, setGraph] = useState<WorkflowGraph | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [serverIssues, setServerIssues] = useState<GraphValidationIssue[]>([]);
  const [view, setView] = useState<"list" | "canvas">("list");
  const [runForm, setRunForm] = useState<Record<string, string> | null>(null);
  const [n8nInfo, setN8nInfo] = useState<{
    mode: string;
    editorUrl: string;
  } | null>(null);

  const load = useCallback(async () => {
    if (!selectedContentId) return;
    try {
      const response = await fetch(
        `/api/workflows/content/${selectedContentId}/graph`
      );
      if (!response.ok) return;
      const body = (await response.json()) as {
        data: {
          title: string;
          graph: WorkflowGraph;
          n8n?: { mode: string; editorUrl: string } | null;
        };
      };
      setTitle(body.data.title);
      setGraph(body.data.graph);
      setN8nInfo(body.data.n8n ?? null);
      setDirty(false);
      setServerIssues([]);
    } catch {
      // surfaced via empty state below
    }
  }, [selectedContentId]);

  useEffect(() => {
    void load();
  }, [load]);

  // AI updates to THIS workflow (v3.1 R2): the chat engine dispatches
  // dg:workflow-refresh when update_workflow/propose_workflow outputs
  // land. A clean canvas reloads silently; a dirty canvas gets a
  // non-destructive banner — silent reload would discard local edits,
  // silently ignoring would let a stale Save clobber the AI's version.
  const [aiUpdatedBanner, setAiUpdatedBanner] = useState(false);
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | { contentId?: string }
        | undefined;
      if (!detail?.contentId || detail.contentId !== selectedContentId) return;
      if (dirtyRef.current) {
        setAiUpdatedBanner(true);
      } else {
        setAiUpdatedBanner(false);
        void load();
      }
    };
    window.addEventListener("dg:workflow-refresh", handler);
    return () => window.removeEventListener("dg:workflow-refresh", handler);
  }, [selectedContentId, load]);

  const chain = useMemo(() => (graph ? deriveChain(graph) : null), [graph]);
  const clientIssues = useMemo(
    () => (graph ? validateGraph(graph).issues : []),
    [graph]
  );
  const issues = serverIssues.length > 0 ? serverIssues : clientIssues;

  const mutateGraph = useCallback(
    (mutate: (draft: WorkflowGraph) => WorkflowGraph) => {
      setGraph((current) => (current ? mutate(current) : current));
      setDirty(true);
      setServerIssues([]);
    },
    []
  );

  const updateNode = useCallback(
    (nodeId: string, patch: Partial<WorkflowGraphNode>) => {
      mutateGraph((draft) => ({
        ...draft,
        nodes: draft.nodes.map((node) =>
          node.id === nodeId ? { ...node, ...patch } : node
        ),
      }));
    },
    [mutateGraph]
  );

  const structuralEdit = useCallback(
    (edit: (order: string[], nodes: WorkflowGraphNode[]) => {
      order: string[];
      nodes: WorkflowGraphNode[];
    }) => {
      mutateGraph((draft) => {
        const { order } = deriveChain(draft);
        const result = edit([...order], [...draft.nodes]);
        return {
          ...draft,
          nodes: result.nodes,
          entryNodeId: result.order[0] ?? "",
          edges: edgesFromChain(result.order, result.nodes),
        };
      });
    },
    [mutateGraph]
  );

  const addNode = useCallback(
    (type: string, afterIndex: number) => {
      structuralEdit((order, nodes) => {
        const id = uniqueNodeId(type, nodes);
        const metadata = getAnyNodeMetadata(type);
        nodes.push({
          id,
          type,
          label: metadata?.label,
          config: {},
        });
        order.splice(afterIndex + 1, 0, id);
        setExpanded(id);
        return { order, nodes };
      });
    },
    [structuralEdit]
  );

  // Prepend a trigger as the entry (recovers pre-trigger graphs).
  const addTrigger = useCallback(
    (type: string) => {
      structuralEdit((order, nodes) => {
        const id = uniqueNodeId(type, nodes);
        nodes.push({ id, type, label: getAnyNodeMetadata(type)?.label, config: {} });
        order.unshift(id);
        setExpanded(id);
        return { order, nodes };
      });
    },
    [structuralEdit]
  );

  const removeNode = useCallback(
    (nodeId: string) => {
      structuralEdit((order, nodes) => ({
        order: order.filter((id) => id !== nodeId),
        nodes: nodes.filter((node) => node.id !== nodeId),
      }));
    },
    [structuralEdit]
  );

  const moveNode = useCallback(
    (nodeId: string, direction: -1 | 1) => {
      structuralEdit((order, nodes) => {
        const index = order.indexOf(nodeId);
        const target = index + direction;
        if (index === -1 || target < 0 || target >= order.length) {
          return { order, nodes };
        }
        [order[index], order[target]] = [order[target], order[index]];
        return { order, nodes };
      });
    },
    [structuralEdit]
  );

  const save = useCallback(async () => {
    if (!graph || !selectedContentId) return;
    setSaving(true);
    try {
      const response = await fetch(
        `/api/workflows/content/${selectedContentId}/graph`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ graph }),
        }
      );
      const body = (await response.json()) as {
        success: boolean;
        error?: { message?: string; issues?: GraphValidationIssue[] };
      };
      if (!response.ok || !body.success) {
        setServerIssues(body.error?.issues ?? []);
        toast.error(body.error?.message ?? "Failed to save workflow.");
        return;
      }
      setDirty(false);
      toast.success("Workflow saved");
    } catch {
      toast.error("Failed to save workflow.");
    } finally {
      setSaving(false);
    }
  }, [graph, selectedContentId]);

  const dispatchRun = useCallback(
    async (input: Record<string, unknown>) => {
      if (!selectedContentId) return;
      setRunning(true);
      try {
        const response = await fetch(
          `/api/workflows/content/${selectedContentId}/dispatch`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ input }),
          }
        );
        const body = (await response.json()) as {
          success: boolean;
          error?: { message?: string };
        };
        if (!response.ok || !body.success) {
          toast.error(body.error?.message ?? "Failed to run workflow.");
          return;
        }
        toast.success("Workflow dispatched — follow it in the Workflows panel");
      } catch {
        toast.error("Failed to run workflow.");
      } finally {
        setRunning(false);
      }
    },
    [selectedContentId]
  );

  const run = useCallback(async () => {
    if (!selectedContentId || !graph) return;
    if (dirty) {
      toast.info("Save the workflow before running it.");
      return;
    }
    // A Manual trigger with declared fields opens a Run form; otherwise
    // dispatch immediately (the trigger provides input via its own source).
    const trigger = graph.nodes.find((node) => isTriggerType(node.type));
    if (trigger?.type === "trigger-manual") {
      const fields = parseManualInputFields(trigger.config);
      if (fields.length > 0) {
        setRunForm(Object.fromEntries(fields.map((field) => [field, ""])));
        return;
      }
    }
    void dispatchRun({});
  }, [selectedContentId, graph, dirty, dispatchRun]);

  if (!graph || !chain) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  // Native n8n flows are authored in n8n's own editor — render the deep-link
  // view instead of the Trellis builder (the placeholder graph is ignored).
  if (n8nInfo?.mode === "native" && selectedContentId) {
    return (
      <N8nFlowView
        contentId={selectedContentId}
        title={title}
        editorUrl={n8nInfo.editorUrl}
      />
    );
  }

  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {aiUpdatedBanner && (
        <div className="flex items-center justify-between gap-2 border-b border-amber-400/40 bg-amber-500/10 px-4 py-2 text-xs text-amber-900 dark:text-amber-200">
          <span>
            The AI updated this workflow — your canvas has unsaved changes.
            Saving now would overwrite the AI&apos;s version.
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setAiUpdatedBanner(false);
                void load();
              }}
              className="rounded-md border border-amber-500/40 px-2 py-1 font-medium hover:bg-amber-500/15 transition-colors"
            >
              Reload (discard my edits)
            </button>
            <button
              type="button"
              onClick={() => setAiUpdatedBanner(false)}
              className="rounded-md px-2 py-1 hover:bg-amber-500/15 transition-colors"
            >
              Keep editing
            </button>
          </span>
        </div>
      )}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-black/10 bg-white/90 px-4 py-2 backdrop-blur dark:border-white/10 dark:bg-gray-950/90">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
            {title || "Workflow"}
          </p>
          <p className="text-[11px] text-gray-400 dark:text-gray-500">
            {graph.nodes.length} steps ·{" "}
            {ENGINE_DISPLAY_NAMES[graph.engine] ?? graph.engine}
            {dirty ? " · unsaved changes" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-black/15 text-[11px] dark:border-white/20">
            {(["list", "canvas"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setView(mode)}
                className={`px-2 py-1 capitalize ${
                  view === mode
                    ? "bg-gold-primary/90 text-white"
                    : "text-gray-600 hover:bg-black/5 dark:text-gray-300 dark:hover:bg-white/10"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={saving || !dirty}
            onClick={() => void save()}
            className="inline-flex items-center gap-1 rounded-md border border-black/15 px-2.5 py-1 text-xs font-medium text-gray-800 hover:bg-black/5 disabled:opacity-40 dark:border-white/20 dark:text-gray-100 dark:hover:bg-white/10"
          >
            {saving ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Save className="h-3 w-3" />
            )}
            Save
          </button>
          <button
            type="button"
            disabled={running || dirty || issues.length > 0}
            onClick={() => void run()}
            className="inline-flex items-center gap-1 rounded-md bg-gold-primary/90 px-2.5 py-1 text-xs font-medium text-white hover:bg-gold-primary disabled:opacity-40"
          >
            {running ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Play className="h-3 w-3" />
            )}
            Run
          </button>
        </div>
      </div>

      {view === "canvas" ? (
        <div className="min-h-0 flex-1">
          <WorkflowCanvas
            graph={graph}
            structureEditable={chain.simple}
            onPositionChange={(nodeId, position) =>
              updateNode(nodeId, { position })
            }
            onNodeConfigChange={updateNode}
            onInsertAfter={(afterId, type) => {
              const index = afterId ? chain.order.indexOf(afterId) : -1;
              addNode(type, index);
            }}
          />
        </div>
      ) : (
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-4">
        {!chain.simple ? (
          <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-300/60 bg-amber-50/70 p-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-900/20 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            This workflow&apos;s branching goes beyond the list editor — step
            configs are editable, but adding/removing/reordering is disabled.
          </div>
        ) : null}

        {!graph.nodes.some((node) => isTriggerType(node.type)) ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
              Every Trellis begins with a trigger
            </p>
            <p className="max-w-xs text-xs text-gray-400 dark:text-gray-500">
              A trigger is what starts the workflow — run it by hand, capture a
              web page, react to an event.
            </p>
            <button
              type="button"
              onClick={() => addTrigger("trigger-manual")}
              className="inline-flex items-center gap-1 rounded-md bg-gold-primary/90 px-2.5 py-1 text-xs font-medium text-white hover:bg-gold-primary"
            >
              <Zap className="h-3 w-3" /> Add a trigger
            </button>
          </div>
        ) : null}

        {issues.length > 0 && graph.nodes.length > 0 ? (
          <div className="mb-3 rounded-md border border-red-300/60 bg-red-50/70 p-2 text-xs text-red-800 dark:border-red-500/30 dark:bg-red-900/20 dark:text-red-200">
            <p className="mb-1 font-medium">Fix before running:</p>
            <ul className="list-inside list-disc space-y-0.5">
              {issues.slice(0, 5).map((issue, index) => (
                <li key={index}>
                  {issue.nodeId ? `[${issue.nodeId}] ` : ""}
                  {issue.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {chain.order.map((nodeId, index) => {
          const node = nodeById.get(nodeId);
          if (!node) return null;
          const metadata = getAnyNodeMetadata(node.type);
          const Icon = NODE_ICONS[node.type] ?? Sparkles;
          const isExpanded = expanded === node.id;
          const isTrigger = isTriggerType(node.type);
          return (
            <div key={node.id}>
              {/* No inserting before the trigger — it is always the entry. */}
              {index === 0 && chain.simple && !isTrigger ? (
                <AddNodeMenu onAdd={(type) => addNode(type, -1)} />
              ) : null}
              <div className="rounded-lg border border-black/10 bg-white dark:border-white/10 dark:bg-gray-900/60">
                <div className="flex items-center gap-2 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setExpanded(isExpanded ? null : node.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                    )}
                    <Icon className="h-4 w-4 shrink-0 text-gold-primary" />
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-medium text-gray-900 dark:text-gray-100">
                        {node.label || metadata?.label || node.type}
                      </span>
                      <span className="block text-[10px] text-gray-400 dark:text-gray-500">
                        {metadata?.label ?? node.type} · {node.id}
                      </span>
                    </span>
                  </button>
                  {chain.simple && !isTrigger ? (
                    <span className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        title="Move up"
                        onClick={() => moveNode(node.id, -1)}
                        disabled={index <= 1}
                        className="rounded p-1 text-gray-400 hover:bg-black/5 hover:text-gray-700 disabled:opacity-30 dark:hover:bg-white/10 dark:hover:text-gray-200"
                      >
                        <ArrowUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        title="Move down"
                        onClick={() => moveNode(node.id, 1)}
                        disabled={index === chain.order.length - 1}
                        className="rounded p-1 text-gray-400 hover:bg-black/5 hover:text-gray-700 disabled:opacity-30 dark:hover:bg-white/10 dark:hover:text-gray-200"
                      >
                        <ArrowDown className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        title="Remove step"
                        onClick={() => removeNode(node.id)}
                        className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-300"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </span>
                  ) : null}
                </div>
                {isExpanded ? (
                  <div className="space-y-2 border-t border-black/5 px-3 py-2 dark:border-white/5">
                    {isTrigger ? (
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-medium text-gray-600 dark:text-gray-300">
                          Trigger type
                        </span>
                        <select
                          className="w-full rounded-md border border-black/15 bg-white px-2 py-1.5 text-xs text-gray-900 dark:border-white/20 dark:bg-gray-900 dark:text-gray-100"
                          value={node.type}
                          onChange={(e) =>
                            updateNode(node.id, {
                              type: e.target.value,
                              config: {},
                              label: getAnyNodeMetadata(e.target.value)?.label,
                            })
                          }
                        >
                          {TRIGGER_TYPE_METADATA.map((trigger) => (
                            <option key={trigger.id} value={trigger.id}>
                              {trigger.label}
                              {trigger.firing === "stubbed" ? " — preview" : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    <ConfigField
                      field={{ key: "__label", label: "Step name", kind: "text" }}
                      value={node.label ?? ""}
                      onChange={(value) =>
                        updateNode(node.id, {
                          label: typeof value === "string" ? value : undefined,
                        })
                      }
                    />
                    {(metadata?.fields ?? []).map((field) => (
                      <ConfigField
                        key={field.key}
                        field={field}
                        value={node.config[field.key]}
                        onChange={(value) =>
                          updateNode(node.id, {
                            config: { ...node.config, [field.key]: value },
                          })
                        }
                      />
                    ))}
                    {node.type === "branch" ? (
                      <p className="text-[10px] text-gray-400 dark:text-gray-500">
                        If true → continue to the next step. If false → the run
                        ends.
                      </p>
                    ) : null}
                    {(metadata?.outputs ?? []).length > 0 ? (
                      <p className="text-[10px] text-gray-400 dark:text-gray-500">
                        Outputs:{" "}
                        {(metadata?.outputs ?? [])
                          .map((output) => `{{${node.id}.${output.key}}}`)
                          .join(" · ")}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {chain.simple ? (
                <AddNodeMenu onAdd={(type) => addNode(type, index)} />
              ) : null}
            </div>
          );
        })}
      </div>
      )}

      {runForm ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-lg border border-black/10 bg-white p-4 shadow-xl dark:border-white/15 dark:bg-gray-950">
            <p className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
              Run {title || "workflow"}
            </p>
            <div className="space-y-2">
              {Object.keys(runForm).map((field) => (
                <ConfigField
                  key={field}
                  field={{ key: field, label: field, kind: "text" }}
                  value={runForm[field]}
                  onChange={(value) =>
                    setRunForm((current) =>
                      current
                        ? { ...current, [field]: String(value ?? "") }
                        : current
                    )
                  }
                />
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRunForm(null)}
                className="rounded-md border border-black/15 px-2.5 py-1 text-xs text-gray-700 hover:bg-black/5 dark:border-white/20 dark:text-gray-200 dark:hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={running}
                onClick={() => {
                  const values = runForm;
                  setRunForm(null);
                  void dispatchRun(values);
                }}
                className="inline-flex items-center gap-1 rounded-md bg-gold-primary/90 px-2.5 py-1 text-xs font-medium text-white hover:bg-gold-primary disabled:opacity-50"
              >
                <Play className="h-3 w-3" /> Run
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
