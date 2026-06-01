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
 * Token totals come from message metadata (`metadata.usage`) when
 * present; otherwise rows show requests only with no $ figure.
 * Capturing usage in metadata is a planned wiring follow-up — for now
 * the adapter renders message counts honestly and the UI flags it.
 */

import { prisma } from "@/lib/database/client";
import type { ConnectionView } from "../types";
import type {
  ModelUsageRow,
  ProviderUsageRow,
  UsageMoney,
  UsageReport,
} from "./types";
import { estimateCost, priceFor } from "./pricing";

interface AggregateKey {
  providerId: string;
  modelId: string;
}

interface AggregateBucket {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  haveTokens: boolean; // false → row shows "requests only"
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
    const attributed = attribute(
      args.allConnections,
      m.providerId,
      m.modelId,
    );
    if (attributed !== args.connection.id) continue;

    const key = keyFor({ providerId: m.providerId, modelId: m.modelId });
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
        haveTokens: false,
      };
      buckets.set(key, bucket);
    }
    bucket.requests += 1;

    // Token usage may live in metadata.usage when the chat route's
    // server-side onFinish persistence is wired (deferred). Until then
    // most messages won't have it; the bucket falls through to
    // requests-only.
    const meta = (m.metadata ?? {}) as { usage?: { inputTokens?: number; outputTokens?: number } };
    if (
      meta.usage &&
      (typeof meta.usage.inputTokens === "number" ||
        typeof meta.usage.outputTokens === "number")
    ) {
      bucket.haveTokens = true;
      const i = meta.usage.inputTokens ?? 0;
      const o = meta.usage.outputTokens ?? 0;
      bucket.inputTokens += i;
      bucket.outputTokens += o;
      bucket.cost += estimateCost(m.modelId, i, o);
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

  for (const [key, b] of buckets) {
    const [providerId, modelId] = key.split("::");
    totalRequests += b.requests;
    if (b.haveTokens) {
      anyTokens = true;
      totalInput += b.inputTokens;
      totalOutput += b.outputTokens;
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
          }
        : undefined,
      cost:
        b.haveTokens && priceFor(modelId)
          ? { amount: b.cost, currency: "USD" }
          : undefined,
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
      cost: anyTokens ? { amount: totalCost, currency: "USD" } : undefined,
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
    note: anyTokens
      ? undefined
      : "Token counts and cost estimates are pending — server-side usage capture isn't wired yet. Counts below are message totals.",
  };
}
