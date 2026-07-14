"use client";

/**
 * Workflow viewer for the browser-extension embed iframe — the "deep" surface
 * the overlay opens for supervise/tweak. Two tabs:
 *   Runs → this workflow's runs + RunDetail (gate approve/decline, cancel).
 *   Edit → the real WorkflowBuilder (tweak the graph, re-run).
 *
 * Session-authed inside the iframe (the embed layout's fetch wrapper injects
 * x-embed-session), so it reuses the same /api/workflows/* routes the in-app
 * panel uses. `?run=` deep-links straight into a run's detail on the Runs tab.
 */

import { useEffect, useState } from "react";
import { ChevronRight, Loader2 } from "lucide-react";
import { WorkflowBuilder } from "@/extensions/workflows/components/WorkflowBuilder";
import { RunDetail, StatusPill } from "@/extensions/workflows/components/RunDetail";
import type { WorkflowRunDto } from "@/extensions/workflows/shared";

type Tab = "runs" | "edit";

interface EmbedWorkflowClientProps {
  contentId: string;
  /** The workflow's definition slug: `content:{contentId}` — filters runs. */
  slug: string;
  /** Deep-link target from the overlay (`?run=`). */
  initialRunId?: string;
}

function RunsList({
  slug,
  onSelect,
}: {
  slug: string;
  onSelect: (runId: string) => void;
}) {
  const [runs, setRuns] = useState<WorkflowRunDto[] | null>(null);

  // Promise-chain (not async/await try/catch) so setState only ever runs in a
  // continuation, never synchronously in the effect body — the React Compiler
  // flags the latter. Runs for THIS workflow: definition slug is content:{id}.
  useEffect(() => {
    let ignore = false;
    fetch("/api/workflows/runs")
      .then((response) =>
        response.ok
          ? (response.json() as Promise<{ data: { runs: WorkflowRunDto[] } }>)
          : Promise.reject(new Error(`Request failed (${response.status})`))
      )
      .then((body) => {
        if (!ignore) {
          setRuns(body.data.runs.filter((run) => run.definition.slug === slug));
        }
      })
      .catch(() => {
        if (!ignore) setRuns([]);
      });
    return () => {
      ignore = true;
    };
  }, [slug]);

  if (runs === null) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }
  if (runs.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-xs text-gray-500 dark:text-gray-400">
        No runs yet. Run this workflow from the browser extension or the Edit
        tab.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-black/5 dark:divide-white/5">
      {runs.map((run) => (
        <li key={run.id}>
          <button
            type="button"
            onClick={() => onSelect(run.id)}
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
  );
}

export function EmbedWorkflowClient({
  contentId,
  slug,
  initialRunId,
}: EmbedWorkflowClientProps) {
  const [tab, setTab] = useState<Tab>(initialRunId ? "runs" : "edit");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(
    initialRunId ?? null
  );

  useEffect(() => {
    window.parent.postMessage({ type: "ready" }, "*");
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-black/10 px-2 py-1.5 dark:border-white/10">
        {(["runs", "edit"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setTab(value);
              if (value === "runs") setSelectedRunId(null);
            }}
            className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize ${
              tab === value
                ? "bg-gold-primary/90 text-white"
                : "text-gray-600 hover:bg-black/5 dark:text-gray-300 dark:hover:bg-white/10"
            }`}
          >
            {value}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "runs" ? (
          selectedRunId ? (
            <RunDetail
              runId={selectedRunId}
              onBack={() => setSelectedRunId(null)}
            />
          ) : (
            <div className="h-full overflow-y-auto">
              <RunsList slug={slug} onSelect={setSelectedRunId} />
            </div>
          )
        ) : (
          <WorkflowBuilder
            selectedContentId={contentId}
            contentType="workflow"
            paneId="top-left"
          />
        )}
      </div>
    </div>
  );
}
