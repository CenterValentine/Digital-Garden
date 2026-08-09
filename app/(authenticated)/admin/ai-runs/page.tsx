/**
 * Admin AI Run Inspector — conversation list.
 *
 * Health-badged list of AI conversations with derived diagnostics
 * (analysis computed per page by /api/admin/ai-runs). Click through to the
 * per-turn detail view.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getSurfaceStyles } from "@/lib/design/system";
import type {
  AiRunListData,
  AiRunSummary,
} from "@/lib/domain/ai/run-inspector/api-types";
import { Skeleton } from "@/components/client/ui/skeleton";
import { Button } from "@/components/client/ui/button";
import { toast } from "sonner";

function formatInt(n: number): string {
  return n.toLocaleString("en-US");
}

interface Filters {
  provider: string;
  model: string;
  hasAnomaly: boolean;
}

const EMPTY_FILTERS: Filters = { provider: "", model: "", hasAnomaly: false };

function HealthCell({ row }: { row: AiRunSummary }) {
  if (row.findings.error + row.findings.warning === 0) {
    return (
      <span className="text-[12px] text-emerald-600 dark:text-emerald-400">
        clean
      </span>
    );
  }
  const shown = row.findingKinds.slice(0, 3);
  return (
    <div className="flex flex-wrap items-center gap-1">
      {row.findings.error > 0 ? (
        <span className="rounded-full border border-red-500/40 bg-red-500/[0.06] px-1.5 text-[11px] text-red-600 dark:text-red-400">
          {row.findings.error} err
        </span>
      ) : null}
      {row.findings.warning > 0 ? (
        <span className="rounded-full border border-amber-500/40 bg-amber-500/[0.06] px-1.5 text-[11px] text-amber-600 dark:text-amber-400">
          {row.findings.warning} warn
        </span>
      ) : null}
      {shown.map((kind) => (
        <span
          key={kind}
          className="rounded border border-black/10 px-1 text-[10px] text-gray-500 dark:border-white/10 dark:text-gray-400"
        >
          {kind}
        </span>
      ))}
      {row.findingKinds.length > shown.length ? (
        <span className="text-[10px] text-gray-400">
          +{row.findingKinds.length - shown.length}
        </span>
      ) : null}
    </div>
  );
}

export default function AiRunsPage() {
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AiRunListData | null>(null);
  const [loading, setLoading] = useState(true);

  const glass0 = getSurfaceStyles("glass-0");

  const fetchRuns = useCallback(async (filters: Filters, pageNum: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(pageNum) });
      if (filters.provider.trim()) params.set("provider", filters.provider.trim());
      if (filters.model.trim()) params.set("model", filters.model.trim());
      if (filters.hasAnomaly) params.set("hasAnomaly", "1");
      const response = await fetch(`/api/admin/ai-runs?${params.toString()}`);
      const result = await response.json();
      if (result.success) {
        setData(result.data);
      } else {
        toast.error(result.error ?? "Failed to load AI runs");
      }
    } catch (error) {
      console.error("Failed to fetch AI runs:", error);
      toast.error("Failed to load AI runs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRuns(applied, page);
  }, [fetchRuns, applied, page]);

  const applyFilters = () => {
    setPage(1);
    setApplied(draft);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">AI Runs</h1>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          Derived diagnostics over persisted conversations — click a row for
          the per-turn timeline.
        </p>
      </div>

      {/* Filters */}
      <div
        className="flex flex-wrap items-end gap-3 rounded-lg border border-black/10 p-3 dark:border-white/10"
        style={{
          background: glass0.background,
          backdropFilter: glass0.backdropFilter,
        }}
      >
        <label className="text-[12px] text-gray-600 dark:text-gray-300">
          Provider
          <input
            value={draft.provider}
            onChange={(e) => setDraft({ ...draft, provider: e.target.value })}
            placeholder="deepseek"
            className="mt-1 block w-36 rounded border border-black/10 bg-transparent px-2 py-1 text-sm dark:border-white/10"
          />
        </label>
        <label className="text-[12px] text-gray-600 dark:text-gray-300">
          Model
          <input
            value={draft.model}
            onChange={(e) => setDraft({ ...draft, model: e.target.value })}
            placeholder="deepseek-v4-flash"
            className="mt-1 block w-44 rounded border border-black/10 bg-transparent px-2 py-1 text-sm dark:border-white/10"
          />
        </label>
        <label className="flex items-center gap-1.5 pb-1 text-[12px] text-gray-600 dark:text-gray-300">
          <input
            type="checkbox"
            checked={draft.hasAnomaly}
            onChange={(e) =>
              setDraft({ ...draft, hasAnomaly: e.target.checked })
            }
          />
          anomalies only
        </label>
        <Button size="sm" variant="outline" onClick={applyFilters}>
          Apply
        </Button>
      </div>

      {/* Rows */}
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : (
        <div className="space-y-2">
          {(data?.rows ?? []).map((row) => (
            <Link
              key={row.conversationId}
              href={`/admin/ai-runs/${row.conversationId}`}
              className="block rounded-lg border border-black/10 p-3 transition-colors hover:bg-black/[0.03] dark:border-white/10 dark:hover:bg-white/[0.04]"
            >
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {row.title ?? "Untitled conversation"}
                </span>
                <HealthCell row={row} />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[12px] text-gray-500 dark:text-gray-400">
                <span>{new Date(row.updatedAt).toLocaleString()}</span>
                <span>{row.assistantTurns} turns</span>
                <span>{formatInt(row.totals.requestCount)} req</span>
                <span>
                  {formatInt(row.totals.inputTokens)} in /{" "}
                  {formatInt(row.totals.outputTokens)} out
                </span>
                {row.models.map((model) => (
                  <span key={model} className="font-mono">
                    {model}
                  </span>
                ))}
              </div>
            </Link>
          ))}
          {(data?.rows ?? []).length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              No conversations match.
            </p>
          ) : null}
        </div>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <Button
          size="sm"
          variant="outline"
          disabled={page <= 1 || loading}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          Previous
        </Button>
        <span className="text-[12px] text-gray-500 dark:text-gray-400">
          page {page}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={!data?.hasMore || loading}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
