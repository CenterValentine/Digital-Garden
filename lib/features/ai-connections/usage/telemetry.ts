/**
 * Telemetry-based usage adapter.
 *
 * Reads `ConversationMessage` records owned by the user and attributes
 * them to a Connection via the resolver-mirror heuristic:
 *
 *   1. **Direct match** — Connection.presetId equals the message's
 *      providerId. Catches "OpenAI direct" Connections serving any
 *      `providerId === "openai"` message.
 *   2. **Namespaced match** — Connection.models contains
 *      `${providerId}/${modelId}`. Catches gateway Connections.
 *
 * When multiple Connections could plausibly serve a message we follow
 * the chat route's resolver priority (direct beats gateway), which
 * makes the meter mirror the routing the user actually saw.
 *
 * Token totals come from message metadata (`metadata.usage`), captured
 * by the chat route + the client's per-turn accumulator. Dollar figures
 * prefer the PERSISTED `metadata.cost` (priced at write time, pinned to
 * the price-table version of that day); rows that predate cost
 * persistence fall back to pricing their usage at CURRENT rates and the
 * report notes it. Models with no price row count as "unpriced" — never
 * silently $0.
 *
 * Attribution upgrade (cost-metering P3): messages persisted after AI 3.4
 * carry `metadata.modelRoute.connectionId` — the EXACT Connection that
 * served the turn. That wins outright; the resolver-mirror heuristic
 * below remains for older rows.
 */

import { prisma } from "@/lib/database/client";
import type { ConnectionView } from "../types";
import type {
  ModelUsageRow,
  ProviderUsageRow,
  UsageMoney,
  UsageReport,
} from "./types";
import { computeTurnCost, readPersistedCost } from "./pricing";

interface AggregateKey {
  providerId: string;
  modelId: string;
}

interface AggregateBucket {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  cost: number;
  haveTokens: boolean; // false → row shows "requests only"
  haveCost: boolean; // false → row shows tokens without a $ figure
  legacyCostRows: number; // rows priced at current rates (no persisted cost)
  unpricedRows: number; // rows with usage but no price entry
}

/**
 * Walk *all* of the user's Connections to decide which one served a
 * given message. First-direct wins, then first-namespaced. Returns null
 * if nothing matches (the message stays in the "unattributed" bucket
 * and doesn't appear in any Connection's meter).
 */
function attribute(
  allConns: ConnectionView[],
  providerId: string,
  modelId: string,
): string | null {
  // Direct first.
  for (const c of allConns) {
    if (c.presetId && c.presetId === providerId && c.models.length > 0) {
      return c.id;
    }
  }
  // Namespaced fallback.
  const namespaced = `${providerId}/${modelId}`;
  for (const c of allConns) {
    if (c.models.some((m) => m.id === namespaced)) return c.id;
  }
  return null;
}

export interface BuildTelemetryReportArgs {
  userId: string;
  connection: ConnectionView;
  /** Required so attribution can disambiguate among the user's Connections. */
  allConnections: ConnectionView[];
  /** Period bounds; default = current calendar month. */
  from?: Date;
  to?: Date;
}

export async function buildTelemetryReport(
  args: BuildTelemetryReportArgs,
): Promise<UsageReport> {
  const now = new Date();
  const from =
    args.from ??
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = args.to ?? now;

  // Pull every assistant message in the window owned by this user.
  // Filter to messages whose stamped (providerId, modelId) attribute
  // to this Connection per the resolver heuristic.
  const messages = await prisma.conversationMessage.findMany({
    where: {
      role: "assistant",
      isHidden: false,
      createdAt: { gte: from, lte: to },
      providerId: { not: null },
      modelId: { not: null },
      conversation: { ownerId: args.userId, deletedAt: null },
    },
    select: {
      providerId: true,
      modelId: true,
      metadata: true,
    },
  });

  const buckets = new Map<string, AggregateBucket>();
  const keyFor = (k: AggregateKey) => `${k.providerId}::${k.modelId}`;

  for (const m of messages) {
    if (!m.providerId || !m.modelId) continue;
    const meta = (m.metadata ?? {}) as {
      usage?: {
        inputTokens?: number;
        outputTokens?: number;
        cachedInputTokens?: number;
        cacheWriteTokens?: number;
      };
      cost?: unknown;
      modelRoute?: { connectionId?: unknown };
    };

    // Exact attribution first (metadata.modelRoute.connectionId names the
    // Connection that actually served the turn); heuristic for old rows.
    const stampedConnectionId =
      typeof meta.modelRoute?.connectionId === "string"
        ? meta.modelRoute.connectionId
        : null;
    const attributed =
      stampedConnectionId &&
      args.allConnections.some((c) => c.id === stampedConnectionId)
        ? stampedConnectionId
        : attribute(args.allConnections, m.providerId, m.modelId);
    if (attributed !== args.connection.id) continue;

    const key = keyFor({ providerId: m.providerId, modelId: m.modelId });
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        cachedInputTokens: 0,
        cost: 0,
        haveTokens: false,
        haveCost: false,
        legacyCostRows: 0,
        unpricedRows: 0,
      };
      buckets.set(key, bucket);
    }
    bucket.requests += 1;

    if (
      meta.usage &&
      (typeof meta.usage.inputTokens === "number" ||
        typeof meta.usage.outputTokens === "number")
    ) {
      bucket.haveTokens = true;
      bucket.inputTokens += meta.usage.inputTokens ?? 0;
      bucket.outputTokens += meta.usage.outputTokens ?? 0;
      bucket.cachedInputTokens += meta.usage.cachedInputTokens ?? 0;

      // Dollar figure: persisted cost wins (write-time pricing, version-
      // pinned); legacy rows priced at current rates; no price row →
      // counted as unpriced, NOT zero.
      const persisted = readPersistedCost(meta.cost);
      if (persisted) {
        bucket.haveCost = true;
        bucket.cost += persisted.usd;
      } else if (
        meta.cost &&
        typeof meta.cost === "object" &&
        (meta.cost as { unpriced?: unknown }).unpriced === true
      ) {
        bucket.unpricedRows += 1;
      } else {
        const computed = computeTurnCost(meta.usage, m.modelId, m.providerId);
        if (computed) {
          bucket.haveCost = true;
          bucket.cost += computed.usd;
          bucket.legacyCostRows += 1;
        } else {
          bucket.unpricedRows += 1;
        }
      }
    }
  }

  // Project buckets into UsageReport rows.
  const byModel: ModelUsageRow[] = [];
  const byProvider = new Map<string, ProviderUsageRow>();
  let totalRequests = 0;
  let totalInput = 0;
  let totalOutput = 0;
  let totalCost = 0;
  let anyTokens = false;
  let anyCost = false;
  let legacyCostRows = 0;
  let unpricedRows = 0;

  for (const [key, b] of buckets) {
    const [providerId, modelId] = key.split("::");
    totalRequests += b.requests;
    legacyCostRows += b.legacyCostRows;
    unpricedRows += b.unpricedRows;
    if (b.haveTokens) {
      anyTokens = true;
      totalInput += b.inputTokens;
      totalOutput += b.outputTokens;
    }
    if (b.haveCost) {
      anyCost = true;
      totalCost += b.cost;
    }
    byModel.push({
      modelId,
      modelName: modelId,
      requests: b.requests,
      tokens: b.haveTokens
        ? {
            input: b.inputTokens,
            output: b.outputTokens,
            total: b.inputTokens + b.outputTokens,
            ...(b.cachedInputTokens > 0 ? { cached: b.cachedInputTokens } : {}),
          }
        : undefined,
      cost: b.haveCost ? { amount: b.cost, currency: "USD" } : undefined,
    });

    const prov = byProvider.get(providerId) ?? {
      providerId,
      requests: 0,
      tokens: undefined as ProviderUsageRow["tokens"],
      cost: undefined as UsageMoney | undefined,
    };
    prov.requests += b.requests;
    if (b.haveTokens) {
      prov.tokens = {
        input: (prov.tokens?.input ?? 0) + b.inputTokens,
        output: (prov.tokens?.output ?? 0) + b.outputTokens,
        total: (prov.tokens?.total ?? 0) + b.inputTokens + b.outputTokens,
      };
    }
    if (b.haveCost) {
      prov.cost = {
        amount: (prov.cost?.amount ?? 0) + b.cost,
        currency: "USD",
      };
    }
    byProvider.set(providerId, prov);
  }

  byModel.sort((a, b) => b.requests - a.requests);
  const byUnderlyingProvider = Array.from(byProvider.values()).sort(
    (a, b) => b.requests - a.requests,
  );

  return {
    source: "telemetry",
    period: { from: from.toISOString(), to: to.toISOString() },
    totals: {
      requests: totalRequests,
      tokens: anyTokens
        ? { input: totalInput, output: totalOutput, total: totalInput + totalOutput }
        : undefined,
      cost: anyCost ? { amount: totalCost, currency: "USD" } : undefined,
    },
    byModel,
    // Only attach the cross-provider breakdown for gateways — for a
    // direct provider Connection the underlying provider is itself.
    byUnderlyingProvider:
      args.connection.presetId &&
      ["vercel-gateway", "openrouter", "fireworks", "together"].some(
        (kind) => args.connection.adapterKind === kind,
      )
        ? byUnderlyingProvider
        : undefined,
    refreshedAt: new Date().toISOString(),
    note: buildReportNote({ anyTokens, legacyCostRows, unpricedRows }),
  };
}

/** Honesty notes: say exactly which figures are soft and why. */
function buildReportNote(args: {
  anyTokens: boolean;
  legacyCostRows: number;
  unpricedRows: number;
}): string | undefined {
  if (!args.anyTokens) {
    return "No token usage captured for messages in this window (they predate usage persistence). Counts are message totals.";
  }
  const parts: string[] = [];
  if (args.legacyCostRows > 0) {
    parts.push(
      `${args.legacyCostRows} turn${args.legacyCostRows === 1 ? "" : "s"} predate write-time pricing — estimated at current list rates`,
    );
  }
  if (args.unpricedRows > 0) {
    parts.push(
      `${args.unpricedRows} turn${args.unpricedRows === 1 ? "" : "s"} on unpriced models excluded from $ totals`,
    );
  }
  return parts.length > 0 ? `${parts.join("; ")}.` : undefined;
}
