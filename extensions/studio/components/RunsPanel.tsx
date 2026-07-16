/**
 * Generation runs panel (Phase 5) — the four run states in the Studio tab.
 *
 * Polls only while something is running; settles to the fetched list
 * otherwise. Completed runs deep-link to their artifact via the content
 * store. Runs execute server-side (`after()`), so this panel reflects —
 * never owns — run progress: closing the tab loses nothing.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useContentStore } from "@/state/content-store";

export interface RunDtoClient {
  id: string;
  toolId: string;
  variantId: string | null;
  status: string;
  stepIndex: number;
  stepTotal: number;
  stepLabel: string;
  outputNodeId: string | null;
  outputTitle: string | null;
  outputContentType: string | null;
  error: string | null;
  createdAt: string;
}

const POLL_MS = 3000;

export function RunsPanel({
  folderId,
  refreshKey,
}: {
  folderId: string;
  refreshKey: number;
}) {
  const [result, setResult] = useState<{
    forFolderId: string;
    runs: RunDtoClient[];
  } | null>(null);
  const setSelectedContentId = useContentStore((s) => s.setSelectedContentId);
  const setSelectedContentType = useContentStore(
    (s) => s.setSelectedContentType
  );

  const fetchRuns = useCallback((targetFolder: string) => {
    fetch(`/api/studio/runs?folderId=${targetFolder}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok || !body.success) return;
        setResult({ forFolderId: targetFolder, runs: body.data });
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    fetchRuns(folderId);
  }, [folderId, refreshKey, fetchRuns]);

  const runs = result?.forFolderId === folderId ? result.runs : [];
  const anyRunning = runs.some((r) => r.status === "running");

  // Poll only while a run is in flight.
  useEffect(() => {
    if (!anyRunning) return;
    const timer = setInterval(() => fetchRuns(folderId), POLL_MS);
    return () => clearInterval(timer);
  }, [anyRunning, folderId, fetchRuns]);

  const openOutput = (run: RunDtoClient) => {
    if (!run.outputNodeId) return;
    setSelectedContentId(run.outputNodeId, {});
    if (run.outputContentType) setSelectedContentType(run.outputContentType);
  };

  if (runs.length === 0) return null;

  return (
    <section className="mt-3">
      <h3 className="px-1 text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
        Runs
      </h3>
      <ul className="mt-1.5 space-y-1">
        {runs.slice(0, 5).map((run) => (
          <li
            key={run.id}
            className="rounded-md border border-black/[0.06] px-2.5 py-2 dark:border-white/[0.08]"
          >
            <div className="flex items-center gap-2">
              {run.status === "running" ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-gold-primary" />
              ) : run.status === "done" ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
              ) : (
                <XCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
              )}
              <span className="min-w-0 flex-1 truncate text-xs text-gray-700 dark:text-gray-200">
                {run.toolId}
                {run.variantId ? ` · ${run.variantId}` : ""}
              </span>
              {run.status === "running" && (
                <span className="shrink-0 text-[10px] text-gray-400 dark:text-gray-500">
                  {run.stepIndex}/{run.stepTotal} {run.stepLabel}
                </span>
              )}
            </div>
            {run.status === "done" && run.outputNodeId && (
              <button
                type="button"
                onClick={() => openOutput(run)}
                className="mt-1 block w-full truncate text-left text-[11px] text-gold-primary hover:underline"
              >
                {run.outputTitle ?? "Open artifact"}
              </button>
            )}
            {run.status === "failed" && run.error && (
              <p className="mt-1 text-[11px] leading-snug text-red-500/90">
                {run.error}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
