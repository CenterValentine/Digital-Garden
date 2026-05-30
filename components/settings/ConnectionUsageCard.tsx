/**
 * ConnectionUsageCard — collapsible meter rendered inside the
 * Connections list (one per Connection).
 *
 * Lazy-fetches `/api/ai/connections/[id]/usage` on first expand, caches
 * the response, exposes a refresh button. Shows:
 *
 *   - Source pill (provider-api / hybrid / telemetry — honesty signal)
 *   - Totals row: requests + estimated cost + budget bar when present
 *   - By-model table: req count, tokens, cost
 *   - By-underlying-provider table (gateways only)
 *   - Note line for caveats (e.g., "token capture not wired yet")
 *
 * No upstream calls happen until the user opens the section — the
 * Connections list stays fast for users who never check usage.
 */

"use client";

import { useCallback, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Gauge,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { ProviderIcon } from "@/components/content/ai/ProviderIcon";
import { Button } from "@/components/ui/glass/button";
import type { UsageReport } from "@/lib/features/ai-connections";

interface ConnectionUsageCardProps {
  connectionId: string;
  /** Initial collapsed/expanded state — defaults to collapsed. */
  defaultOpen?: boolean;
}

export function ConnectionUsageCard({
  connectionId,
  defaultOpen = false,
}: ConnectionUsageCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<UsageReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/ai/connections/${encodeURIComponent(connectionId)}/usage`,
        { credentials: "include" },
      );
      const body = await res.json();
      if (!res.ok || !body?.success) {
        setError(body?.error?.message ?? "Failed to load usage");
        return;
      }
      setReport(body.data as UsageReport);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [connectionId]);

  const handleToggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      // Lazy-fetch on first open. Subsequent opens reuse the cached
      // report; user can press Refresh to re-fetch.
      if (next && !report && !loading) void load();
      return next;
    });
  }, [report, loading, load]);

  return (
    <div className="mt-2 rounded-lg border border-white/10 bg-black/10">
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-gray-300 hover:bg-white/5 transition-colors rounded-lg"
      >
        {open ? (
          <ChevronDown className="h-3 w-3 text-gray-500 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-gray-500 shrink-0" />
        )}
        <Gauge className="h-3 w-3 text-amber-300/80 shrink-0" />
        <span className="font-medium">Usage</span>
        {report && (
          <span className="text-gray-500 ml-1.5">
            ·{" "}
            {report.totals.cost
              ? formatMoney(report.totals.cost.amount)
              : `${report.totals.requests} turn${report.totals.requests === 1 ? "" : "s"}`}
          </span>
        )}
        {report && (
          <span className="ml-auto text-[10px] uppercase tracking-wide text-gray-500">
            {sourceLabel(report.source)}
          </span>
        )}
      </button>

      {open && (
        <div className="border-t border-white/5 px-3 py-3 space-y-3">
          {loading && (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading usage…
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0 break-words">{error}</div>
            </div>
          )}

          {report && !loading && (
            <>
              {/* Totals + refresh */}
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="text-[11px] uppercase tracking-wide text-gray-500">
                    {periodLabel(report.period)}
                  </div>
                  <div className="text-sm text-white">
                    {report.totals.cost ? (
                      <span className="font-semibold">
                        {formatMoney(report.totals.cost.amount)}
                      </span>
                    ) : (
                      <span className="text-gray-400">no cost data</span>
                    )}
                    <span className="text-gray-500 ml-2">
                      · {report.totals.requests} turn
                      {report.totals.requests === 1 ? "" : "s"}
                    </span>
                    {report.totals.tokens?.total !== undefined && (
                      <span className="text-gray-500 ml-2">
                        · {formatTokens(report.totals.tokens.total)} tokens
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void load()}
                  disabled={loading}
                  title="Refresh"
                >
                  <RefreshCw className="h-3 w-3" />
                </Button>
              </div>

              {/* Budget bar (when available) */}
              {report.budget && (
                <BudgetBar budget={report.budget} />
              )}

              {/* Per-underlying-provider for gateways */}
              {report.byUnderlyingProvider && report.byUnderlyingProvider.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] uppercase tracking-wide text-gray-500">
                    By underlying provider
                  </div>
                  <div className="space-y-0.5">
                    {report.byUnderlyingProvider.map((p) => (
                      <div
                        key={p.providerId}
                        className="flex items-center gap-2 text-xs px-2 py-1 rounded-md bg-white/[0.02]"
                      >
                        <ProviderIcon
                          providerId={p.providerId}
                          className="h-3 w-3 shrink-0"
                        />
                        <span className="flex-1 capitalize">{p.providerId}</span>
                        <span className="text-gray-500">
                          {p.requests} turn{p.requests === 1 ? "" : "s"}
                        </span>
                        {p.cost && (
                          <span className="font-medium text-amber-200/80 ml-2">
                            {formatMoney(p.cost.amount)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Per-model breakdown */}
              {report.byModel.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] uppercase tracking-wide text-gray-500">
                    By model
                  </div>
                  <div className="space-y-0.5 max-h-48 overflow-y-auto pr-1">
                    {report.byModel.map((m) => (
                      <div
                        key={m.modelId}
                        className="flex items-center gap-2 text-xs px-2 py-1 rounded-md hover:bg-white/[0.04]"
                      >
                        <code className="text-amber-200/90 font-mono truncate flex-1">
                          {m.modelId}
                        </code>
                        <span className="text-gray-500 shrink-0">
                          {m.requests}
                        </span>
                        {m.tokens?.total !== undefined && (
                          <span className="text-gray-500 shrink-0">
                            · {formatTokens(m.tokens.total)} tok
                          </span>
                        )}
                        {m.cost && (
                          <span className="font-medium text-amber-200/80 shrink-0 ml-1">
                            {formatMoney(m.cost.amount)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {report.byModel.length === 0 && !error && (
                <div className="text-xs text-gray-500 italic">
                  No turns recorded in this period yet.
                </div>
              )}

              {/* Adapter note */}
              {report.note && (
                <div className="text-[11px] text-gray-500 italic leading-relaxed">
                  {report.note}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function BudgetBar({ budget }: { budget: NonNullable<UsageReport["budget"]> }) {
  const pct =
    budget.limit.amount > 0
      ? Math.min(100, (budget.used.amount / budget.limit.amount) * 100)
      : 0;
  const tone =
    pct >= 90
      ? { bar: "bg-red-500", text: "text-red-300" }
      : pct >= 70
        ? { bar: "bg-amber-500", text: "text-amber-300" }
        : { bar: "bg-emerald-500", text: "text-emerald-300" };
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-gray-400">Budget</span>
        <span className={tone.text}>
          {formatMoney(budget.used.amount)} / {formatMoney(budget.limit.amount)}{" "}
          ({Math.round(pct)}%)
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div
          className={`h-full ${tone.bar} transition-all duration-300`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function formatMoney(amount: number): string {
  if (amount < 0.01) return amount === 0 ? "$0.00" : `<$0.01`;
  if (amount < 1) return `$${amount.toFixed(3)}`;
  if (amount < 100) return `$${amount.toFixed(2)}`;
  return `$${Math.round(amount).toLocaleString()}`;
}

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

function sourceLabel(source: UsageReport["source"]): string {
  if (source === "provider-api") return "Official";
  if (source === "hybrid") return "Hybrid";
  return "Estimated";
}

function periodLabel(period: UsageReport["period"]): string {
  if (period.from === "key-lifetime") return "Key lifetime";
  try {
    const from = new Date(period.from);
    const to = new Date(period.to);
    const sameMonth =
      from.getUTCFullYear() === to.getUTCFullYear() &&
      from.getUTCMonth() === to.getUTCMonth();
    if (sameMonth) {
      // Period bounds are constructed in UTC (`Date.UTC(year, month, 1)`),
      // so format in UTC too — otherwise local-timezone offsets show the
      // previous month for users west of UTC.
      return from.toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      });
    }
    return `${from.toLocaleDateString(undefined, { timeZone: "UTC" })} – ${to.toLocaleDateString(undefined, { timeZone: "UTC" })}`;
  } catch {
    return "Current period";
  }
}
