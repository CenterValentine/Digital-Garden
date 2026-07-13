"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Ban,
  Check,
  ChevronRight,
  Loader2,
  Play,
  RefreshCw,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  DISPATCHABLE_WORKFLOWS,
  isTerminal,
  WORKFLOW_RUN_STATUSES,
  type WorkflowRunDto,
  type WorkflowRunStatusValue,
} from "../shared";
import { deriveChain } from "../graph/chain";
import { workflowGraphSchema } from "../graph/schema";
import { getNodeTypeMetadata } from "../nodes/metadata";
import { useWorkflowRunsStore } from "../state/workflow-runs-store";

const STATUS_STYLES: Record<WorkflowRunStatusValue, string> = {
  queued: "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200",
  running: "bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-200",
  waiting:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200",
  succeeded:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200",
  failed: "bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-200",
  canceled: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

function StatusPill({ status }: { status: WorkflowRunStatusValue }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      error?: { message?: string };
    };
    return body.error?.message ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

type NodeRunStatus = "done" | "waiting" | "failed" | "pending";

/**
 * Snapshot view: the graph THIS run executed (from its input snapshot),
 * with per-node status derived from the event trail. Renders only for
 * interpreter runs whose input carries a graph.
 */
function RunGraphSteps({ run }: { run: WorkflowRunDto }) {
  const parsed = workflowGraphSchema.safeParse(
    (run.input as Record<string, unknown>).graph
  );
  if (!parsed.success) return null;
  const graph = parsed.data;
  const { order } = deriveChain(graph);
  const events = run.events ?? [];
  const completed = new Set(
    events
      .filter((event) => event.type === "step.completed" && event.stepName)
      .map((event) => event.stepName as string)
  );
  const failedMessage =
    typeof run.error?.message === "string" ? run.error.message : "";

  const statuses = new Map<string, NodeRunStatus>();
  let lastActive = -1;
  order.forEach((id, index) => {
    if (completed.has(id)) {
      statuses.set(id, "done");
      lastActive = Math.max(lastActive, index);
    } else if (run.status === "waiting" && run.gateToken?.endsWith(`:${id}`)) {
      statuses.set(id, "waiting");
      lastActive = Math.max(lastActive, index);
    }
  });
  order.forEach((id, index) => {
    if (statuses.has(id)) return;
    const node = graph.nodes.find((n) => n.id === id);
    const label = node?.label ?? id;
    if (
      run.status === "failed" &&
      (failedMessage.includes(`"${label}"`) || failedMessage.includes(`"${id}"`))
    ) {
      statuses.set(id, "failed");
    } else if (index < lastActive) {
      statuses.set(id, "done"); // e.g. resumed gates leave no step.completed
    } else {
      statuses.set(id, "pending");
    }
  });

  const STATUS_DOT: Record<NodeRunStatus, string> = {
    done: "bg-emerald-500",
    waiting: "bg-amber-400 animate-pulse",
    failed: "bg-red-500",
    pending: "bg-gray-300 dark:bg-gray-600",
  };

  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Steps
      </p>
      <ol className="space-y-1">
        {order.map((id) => {
          const node = graph.nodes.find((n) => n.id === id);
          if (!node) return null;
          const status = statuses.get(id) ?? "pending";
          return (
            <li key={id} className="flex items-center gap-2 text-xs">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[status]}`}
              />
              <span className="min-w-0 flex-1 truncate text-gray-800 dark:text-gray-200">
                {node.label ?? getNodeTypeMetadata(node.type)?.label ?? node.type}
              </span>
              <span className="shrink-0 text-[10px] text-gray-400 dark:text-gray-500">
                {status}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function RunTimeline({ run }: { run: WorkflowRunDto }) {
  const events = run.events ?? [];
  if (events.length === 0) {
    return (
      <p className="text-xs text-gray-500 dark:text-gray-400">No events yet.</p>
    );
  }
  return (
    <ol className="space-y-1.5">
      {events.map((event) => (
        <li key={event.id} className="flex items-start gap-2 text-xs">
          <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-primary/70" />
          <div className="min-w-0">
            <span className="font-medium text-gray-800 dark:text-gray-200">
              {event.type}
            </span>
            {event.stepName ? (
              <span className="text-gray-500 dark:text-gray-400">
                {" "}
                · {event.stepName}
              </span>
            ) : null}
            <span className="block text-[10px] text-gray-400 dark:text-gray-500">
              {new Date(event.createdAt).toLocaleTimeString()}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

function GateCard({
  run,
  onResolved,
}: {
  run: WorkflowRunDto;
  onResolved: () => void;
}) {
  const [busy, setBusy] = useState<null | "approve" | "decline">(null);

  const resolve = useCallback(
    async (approved: boolean) => {
      if (!run.gateToken) return;
      setBusy(approved ? "approve" : "decline");
      try {
        const response = await fetch(`/api/workflows/runs/${run.id}/resume`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: run.gateToken,
            payload: { approved },
          }),
        });
        if (!response.ok) {
          toast.error(await readError(response));
          return;
        }
        toast.success(approved ? "Approved — resuming" : "Declined");
        onResolved();
      } catch {
        toast.error("Failed to resume the run.");
      } finally {
        setBusy(null);
      }
    },
    [run.id, run.gateToken, onResolved]
  );

  const gateEvent = (run.events ?? [])
    .filter((event) => event.type === "gate.opened")
    .at(-1);
  const title =
    typeof gateEvent?.payload?.title === "string"
      ? gateEvent.payload.title
      : "Awaiting your review";
  const body =
    typeof gateEvent?.payload?.body === "string" ? gateEvent.payload.body : null;

  return (
    <div className="rounded-lg border border-amber-300/60 bg-amber-50/70 p-3 dark:border-amber-500/30 dark:bg-amber-900/20">
      <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
        {title}
      </p>
      {body ? (
        <p className="mt-1 text-xs text-amber-800/90 dark:text-amber-200/80">
          {body}
        </p>
      ) : null}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void resolve(true)}
          className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy === "approve" ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Check className="h-3 w-3" />
          )}
          Approve
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void resolve(false)}
          className="inline-flex items-center gap-1 rounded-md border border-amber-400/60 px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 dark:text-amber-100 dark:hover:bg-amber-900/40 disabled:opacity-50"
        >
          {busy === "decline" ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <X className="h-3 w-3" />
          )}
          Decline
        </button>
      </div>
    </div>
  );
}

function RunDetail({
  runId,
  onBack,
}: {
  runId: string;
  onBack: () => void;
}) {
  const [run, setRun] = useState<WorkflowRunDto | null>(null);
  const [canceling, setCanceling] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/workflows/runs/${runId}`);
      if (!response.ok) return;
      const body = (await response.json()) as {
        data: { run: WorkflowRunDto };
      };
      setRun(body.data.run);
    } catch {
      // transient — next poll retries
    }
  }, [runId]);

  // Poll only while the detail is open AND the run is still moving.
  useEffect(() => {
    void load();
  }, [load]);
  const active = run ? !isTerminal(run.status) : true;
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => void load(), 3000);
    return () => clearInterval(timer);
  }, [active, load]);

  const cancel = useCallback(async () => {
    setCanceling(true);
    try {
      const response = await fetch(`/api/workflows/runs/${runId}/cancel`, {
        method: "POST",
      });
      if (!response.ok) {
        toast.error(await readError(response));
        return;
      }
      toast.success("Run canceled");
      void load();
    } catch {
      toast.error("Failed to cancel the run.");
    } finally {
      setCanceling(false);
    }
  }, [runId, load]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-black/10 px-3 py-2 dark:border-white/10">
        <button
          type="button"
          onClick={onBack}
          className="rounded p-1 text-gray-500 hover:bg-black/5 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-gray-100"
          title="Back to runs"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
            {run?.definition.name ?? "Run"}
          </p>
        </div>
        {run ? <StatusPill status={run.status} /> : null}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {!run ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : (
          <>
            {run.status === "waiting" && run.gateToken ? (
              <GateCard run={run} onResolved={() => void load()} />
            ) : null}

            {run.error ? (
              <div className="rounded-lg border border-red-300/60 bg-red-50/70 p-3 text-xs text-red-800 dark:border-red-500/30 dark:bg-red-900/20 dark:text-red-200">
                {typeof run.error.message === "string"
                  ? run.error.message
                  : "Run failed."}
              </div>
            ) : null}

            {run.conversationId ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Linked conversation: {run.conversationId.slice(0, 8)}…
              </p>
            ) : null}

            {(run.artifacts ?? []).length > 0 ? (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Artifacts
                </p>
                <ul className="space-y-1">
                  {(run.artifacts ?? []).map((artifact) => (
                    <li
                      key={artifact.id}
                      className="rounded border border-black/10 px-2 py-1 text-xs text-gray-700 dark:border-white/10 dark:text-gray-200"
                    >
                      {artifact.label}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <RunGraphSteps run={run} />

            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Timeline
              </p>
              <RunTimeline run={run} />
            </div>

            {!isTerminal(run.status) ? (
              <button
                type="button"
                disabled={canceling}
                onClick={() => void cancel()}
                className="inline-flex items-center gap-1 rounded-md border border-red-300/70 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-900/30 disabled:opacity-50"
              >
                {canceling ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Ban className="h-3 w-3" />
                )}
                Cancel run
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function DispatchMenu({ onDispatched }: { onDispatched: () => void }) {
  const [open, setOpen] = useState(false);
  const [busySlug, setBusySlug] = useState<string | null>(null);

  const dispatch = useCallback(
    async (slug: string, needsUrl: boolean) => {
      let input: Record<string, unknown> = {};
      if (needsUrl) {
        const pageUrl = window.prompt("Job listing URL:");
        if (!pageUrl) return;
        input = { pageUrl };
      }
      setBusySlug(slug);
      try {
        const response = await fetch("/api/workflows/dispatch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, input }),
        });
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
        setBusySlug(null);
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
        <div className="absolute right-0 z-20 mt-1 w-44 rounded-md border border-black/10 bg-white p-1 shadow-lg dark:border-white/15 dark:bg-gray-900">
          {DISPATCHABLE_WORKFLOWS.map((workflow) => (
            <button
              key={workflow.slug}
              type="button"
              disabled={busySlug !== null}
              onClick={() => void dispatch(workflow.slug, workflow.needsUrl)}
              className="flex w-full items-center justify-between gap-1 rounded px-2 py-1.5 text-left text-xs text-gray-800 hover:bg-black/5 dark:text-gray-100 dark:hover:bg-white/10 disabled:opacity-50"
            >
              {workflow.name}
              {busySlug === workflow.slug ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function WorkflowsPanel() {
  const { selectedRunId, statusFilter, selectRun, setStatusFilter } =
    useWorkflowRunsStore();
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
          <DispatchMenu onDispatched={() => void loadRuns()} />
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
