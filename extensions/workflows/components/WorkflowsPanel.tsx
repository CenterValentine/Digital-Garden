"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, Loader2, Play, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  DISPATCHABLE_WORKFLOWS,
  WORKFLOW_RUN_STATUSES,
  type WorkflowRunDto,
  type WorkflowRunStatusValue,
} from "../shared";
import { useContentStore } from "@/state/content-store";
import { useWorkflowRunsStore } from "../state/workflow-runs-store";
import { readError, RunDetail, StatusPill } from "./RunDetail";

interface WorkflowListItem {
  id: string;
  title: string;
  enabled: boolean;
}

function DispatchMenu({
  onDispatched,
  onOpenWorkflow,
}: {
  onDispatched: () => void;
  onOpenWorkflow: (contentNodeId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowListItem[] | null>(null);

  const loadWorkflows = useCallback(async () => {
    try {
      const response = await fetch("/api/workflows/content");
      if (!response.ok) return;
      const body = (await response.json()) as {
        data: { workflows: WorkflowListItem[] };
      };
      setWorkflows(body.data.workflows);
    } catch {
      setWorkflows([]);
    }
  }, []);

  useEffect(() => {
    if (open && workflows === null) void loadWorkflows();
  }, [open, workflows, loadWorkflows]);

  const dispatchContent = useCallback(
    async (item: WorkflowListItem) => {
      setBusyId(item.id);
      try {
        const response = await fetch(
          `/api/workflows/content/${item.id}/dispatch`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ input: {} }),
          }
        );
        if (!response.ok) {
          toast.error(await readError(response));
          return;
        }
        toast.success("Workflow dispatched");
        setOpen(false);
        onDispatched();
      } catch {
        toast.error("Failed to dispatch workflow.");
      } finally {
        setBusyId(null);
      }
    },
    [onDispatched]
  );

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-1 rounded-md bg-gold-primary/90 px-2.5 py-1 text-xs font-medium text-white hover:bg-gold-primary"
      >
        <Play className="h-3 w-3" />
        Run
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-1 w-60 rounded-md border border-black/10 bg-white p-1 shadow-lg dark:border-white/15 dark:bg-gray-900">
          <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            Your workflows
          </p>
          {workflows === null ? (
            <div className="flex justify-center py-3">
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            </div>
          ) : workflows.length === 0 ? (
            <p className="px-2 py-2 text-[11px] text-gray-500 dark:text-gray-400">
              No workflows yet. Create one with + → Workflow → Trellis Flow.
            </p>
          ) : (
            workflows.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-1 rounded px-2 py-1.5 text-xs text-gray-800 hover:bg-black/5 dark:text-gray-100 dark:hover:bg-white/10"
              >
                <button
                  type="button"
                  disabled={busyId !== null || !item.enabled}
                  onClick={() => void dispatchContent(item)}
                  className="flex min-w-0 flex-1 items-center gap-1 text-left disabled:opacity-40"
                  title={item.enabled ? "Run now" : "Disabled"}
                >
                  <Play className="h-3 w-3 shrink-0 text-gold-primary" />
                  <span className="truncate">{item.title}</span>
                </button>
                {busyId === item.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <button
                    type="button"
                    title="Open in builder"
                    onClick={() => {
                      setOpen(false);
                      onOpenWorkflow(item.id);
                    }}
                    className="rounded p-0.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                  >
                    <ChevronRight className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))
          )}
          {DISPATCHABLE_WORKFLOWS.length > 0 ? (
            <>
              <div className="my-1 border-t border-black/5 dark:border-white/10" />
              <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Diagnostics
              </p>
              {DISPATCHABLE_WORKFLOWS.map((workflow) => (
                <button
                  key={workflow.slug}
                  type="button"
                  disabled={busyId !== null}
                  onClick={async () => {
                    setBusyId(workflow.slug);
                    try {
                      const response = await fetch("/api/workflows/dispatch", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ slug: workflow.slug, input: {} }),
                      });
                      if (!response.ok) {
                        toast.error(await readError(response));
                        return;
                      }
                      toast.success("Dispatched");
                      setOpen(false);
                      onDispatched();
                    } finally {
                      setBusyId(null);
                    }
                  }}
                  className="flex w-full items-center gap-1 rounded px-2 py-1.5 text-left text-xs text-gray-500 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50"
                >
                  {workflow.name}
                </button>
              ))}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function WorkflowsPanel() {
  const { selectedRunId, statusFilter, selectRun, setStatusFilter } =
    useWorkflowRunsStore();
  const setSelectedContentId = useContentStore(
    (state) => state.setSelectedContentId
  );
  const [runs, setRuns] = useState<WorkflowRunDto[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRuns = useCallback(async () => {
    try {
      const query =
        statusFilter === "all" ? "" : `?status=${encodeURIComponent(statusFilter)}`;
      const response = await fetch(`/api/workflows/runs${query}`);
      if (!response.ok) return;
      const body = (await response.json()) as {
        data: { runs: WorkflowRunDto[] };
      };
      setRuns(body.data.runs);
    } catch {
      // transient — refresh retries
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    setLoading(true);
    void loadRuns();
  }, [loadRuns]);

  const filterOptions = useMemo(
    () => ["all", ...WORKFLOW_RUN_STATUSES] as const,
    []
  );

  if (selectedRunId) {
    return <RunDetail runId={selectedRunId} onBack={() => selectRun(null)} />;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-black/10 px-3 py-2 dark:border-white/10">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Workflows
        </p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void loadRuns()}
            className="rounded p-1 text-gray-500 hover:bg-black/5 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-gray-100"
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <DispatchMenu
            onDispatched={() => void loadRuns()}
            onOpenWorkflow={(contentNodeId) =>
              setSelectedContentId(contentNodeId, {
                contentType: "workflow",
                pin: true,
              })
            }
          />
        </div>
      </div>

      <div className="border-b border-black/10 px-3 py-2 dark:border-white/10">
        <select
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(
              event.target.value as WorkflowRunStatusValue | "all"
            )
          }
          className="w-full rounded-md border border-black/15 bg-white px-2 py-1 text-xs text-gray-900 dark:border-white/20 dark:bg-gray-900 dark:text-gray-100"
        >
          {filterOptions.map((option) => (
            <option key={option} value={option}>
              {option === "all" ? "All statuses" : option}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : runs.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-gray-500 dark:text-gray-400">
            No runs yet. Dispatch one with the Run button.
          </p>
        ) : (
          <ul className="divide-y divide-black/5 dark:divide-white/5">
            {runs.map((run) => (
              <li key={run.id}>
                <button
                  type="button"
                  onClick={() => selectRun(run.id)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-gray-900 dark:text-gray-100">
                      {run.definition.name}
                    </p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500">
                      {new Date(run.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <StatusPill status={run.status} />
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
