/**
 * Per-Connection usage — public entrypoint.
 *
 * `getConnectionUsage()` is the function the API route calls. It
 * dispatches to provider-specific real-usage adapters first
 * (OpenRouter, Vercel AI Gateway) and merges in telemetry-based
 * per-model breakdown. When the provider-api call fails or doesn't
 * exist, we fall back to telemetry-only.
 *
 * The composed report's `source` field signals which path produced
 * each number — UI shows it so users know when figures are official
 * vs. estimated.
 */

import {
  getConnectionWithKey,
  listConnections,
} from "../service";
import { buildTelemetryReport } from "./telemetry";
import {
  fetchOpenRouterUsage,
  fetchVercelGatewayUsage,
} from "./gateway";
import type { UsageReport } from "./types";

export type {
  UsageBudget,
  UsageMoney,
  UsagePeriod,
  UsageReport,
  UsageSource,
  UsageTokens,
  ModelUsageRow,
  ProviderUsageRow,
} from "./types";

export interface GetConnectionUsageArgs {
  userId: string;
  connectionId: string;
  from?: Date;
  to?: Date;
}

export async function getConnectionUsage(
  args: GetConnectionUsageArgs,
): Promise<UsageReport> {
  const conn = await getConnectionWithKey(args.userId, args.connectionId);
  const allConns = await listConnections(args.userId);
  const connView = allConns.find((c) => c.id === args.connectionId);
  if (!connView) {
    // listConnections filters by ownerId + not-deleted; if we got here
    // via getConnectionWithKey but the listConnections view is missing,
    // attribute against just this Connection.
    throw new Error("Connection visible but not listable — unexpected state.");
  }

  // Always compute the telemetry report (cheap; reads local DB) — it
  // provides the per-model breakdown even when the upstream gives us
  // just totals.
  const telemetry = await buildTelemetryReport({
    userId: args.userId,
    connection: connView,
    allConnections: allConns,
    from: args.from,
    to: args.to,
  });

  // Best-effort provider-API call for "real" numbers. Returns null on
  // any failure (including "this adapter doesn't apply").
  const provider =
    (await fetchOpenRouterUsage(conn)) ??
    (await fetchVercelGatewayUsage(conn)) ??
    null;

  if (!provider) return telemetry;

  // Merge: provider's totals + telemetry's per-model breakdown. Mark
  // the composed report as `hybrid` so the UI can label sources.
  return {
    source: "hybrid",
    period: provider.period,
    totals: provider.totals.cost
      ? {
          requests: telemetry.totals.requests,
          tokens: telemetry.totals.tokens,
          cost: provider.totals.cost,
        }
      : telemetry.totals,
    byModel: telemetry.byModel,
    byUnderlyingProvider: telemetry.byUnderlyingProvider,
    budget: provider.budget,
    refreshedAt: new Date().toISOString(),
    note:
      provider.note ??
      "Total cost is official from the upstream; per-model breakdown is estimated from local telemetry.",
  };
}
