/**
 * Gateway-specific real-usage adapters.
 *
 * Currently:
 *   - **OpenRouter** — `GET /api/v1/key` returns the gateway's own
 *     accounting: total credits used (USD), remaining limit, label.
 *     Authoritative for cost; we don't need to maintain a price table
 *     for OpenRouter-routed turns.
 *   - **Vercel AI Gateway** — `GET /v1/credits` (and `/v1/usage` when
 *     it lands publicly). Best-effort: returns balance metadata when
 *     the upstream cooperates; otherwise we throw and fall through to
 *     telemetry.
 *
 * Both adapters return `null` when the upstream call fails — the
 * caller falls through to the telemetry-only path so the user still
 * sees *something*.
 */

import type { ConnectionWithKey } from "../types";
import type { UsageReport } from "./types";

/**
 * Hit the OpenRouter `/api/v1/key` endpoint. Returns just the totals;
 * per-model breakdown lives in a separate (slower) endpoint we skip
 * for v1.
 */
export async function fetchOpenRouterUsage(
  conn: ConnectionWithKey,
): Promise<UsageReport | null> {
  if (conn.adapterKind !== "openai-compat" || conn.presetId !== "openrouter") {
    return null;
  }
  try {
    const res = await fetch("https://openrouter.ai/api/v1/key", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${conn.apiKey}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      data?: {
        usage?: number;
        limit?: number | null;
        limit_remaining?: number | null;
        is_free_tier?: boolean;
      };
    };
    const data = body.data ?? {};
    const used = Number(data.usage ?? 0);
    const limit = data.limit !== null && data.limit !== undefined ? Number(data.limit) : null;
    const remaining =
      data.limit_remaining !== null && data.limit_remaining !== undefined
        ? Number(data.limit_remaining)
        : limit !== null
          ? Math.max(0, limit - used)
          : null;

    return {
      source: "provider-api",
      // OpenRouter doesn't expose a period for `usage` — it's lifetime
      // for the key. We surface that in the period bounds.
      period: { from: "key-lifetime", to: new Date().toISOString() },
      totals: {
        requests: 0,
        cost: { amount: used, currency: "USD" },
      },
      byModel: [],
      budget:
        limit !== null && remaining !== null
          ? {
              limit: { amount: limit, currency: "USD" },
              used: { amount: used, currency: "USD" },
              remaining: { amount: remaining, currency: "USD" },
            }
          : undefined,
      refreshedAt: new Date().toISOString(),
      note:
        "OpenRouter reports lifetime usage for this key. Per-model breakdown lives in our local telemetry.",
    };
  } catch {
    return null;
  }
}

/**
 * Vercel AI Gateway exposes credit balance + recent usage via
 * `https://ai-gateway.vercel.sh/v1/credits`. Endpoint shape is
 * documented loosely; we treat it as best-effort and degrade
 * gracefully when the upstream responds in an unexpected way.
 */
export async function fetchVercelGatewayUsage(
  conn: ConnectionWithKey,
): Promise<UsageReport | null> {
  if (conn.adapterKind !== "vercel-gateway") return null;
  try {
    const res = await fetch("https://ai-gateway.vercel.sh/v1/credits", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${conn.apiKey}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as Record<string, unknown>;

    // Defensive extraction — the endpoint isn't formally stabilized.
    const balance = pickNumber(body, ["balance", "credits", "remaining"]);
    const totalUsed = pickNumber(body, ["used", "spent", "total_used"]);

    if (balance === null && totalUsed === null) return null;

    return {
      source: "provider-api",
      period: { from: "key-lifetime", to: new Date().toISOString() },
      totals: {
        requests: 0,
        cost:
          totalUsed !== null
            ? { amount: totalUsed, currency: "USD" }
            : undefined,
      },
      byModel: [],
      budget:
        balance !== null && totalUsed !== null
          ? {
              limit: { amount: balance + totalUsed, currency: "USD" },
              used: { amount: totalUsed, currency: "USD" },
              remaining: { amount: balance, currency: "USD" },
            }
          : balance !== null
            ? {
                limit: { amount: balance, currency: "USD" },
                used: { amount: 0, currency: "USD" },
                remaining: { amount: balance, currency: "USD" },
              }
            : undefined,
      refreshedAt: new Date().toISOString(),
      note: "Vercel AI Gateway lifetime balance. Per-model breakdown from local telemetry.",
    };
  } catch {
    return null;
  }
}

function pickNumber(
  obj: Record<string, unknown>,
  keys: string[],
): number | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}
