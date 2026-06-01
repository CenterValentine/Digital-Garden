/**
 * Provider-specific real-usage adapters.
 *
 * **Working adapters (real per-key endpoints):**
 *   - **OpenRouter** — `GET /api/v1/key` returns the gateway's own
 *     accounting: total credits used (USD), remaining limit, label.
 *     Authoritative for cost; we don't need to maintain a price table
 *     for OpenRouter-routed turns.
 *   - **Vercel AI Gateway** — `GET /v1/credits` (and `/v1/usage` when
 *     it lands publicly). Best-effort: returns balance metadata when
 *     the upstream cooperates; otherwise we throw and fall through to
 *     telemetry.
 *
 * **Documented null adapters (no per-key endpoint exists):**
 *   - **Anthropic** — usage is org-scoped via the Anthropic Console.
 *     There is no `GET /v1/keys/<key>/usage` style endpoint. Adapter
 *     returns null unconditionally so the composer falls through to
 *     telemetry. If Anthropic ships a usage API, replace the body.
 *   - **Google (Gemini)** — usage flows through Google Cloud billing,
 *     which is project-scoped, not API-key-scoped. The Generative
 *     Language API exposes no per-key usage endpoint. Same null
 *     fallthrough as Anthropic.
 *
 * All adapters return `null` when the upstream call fails or when no
 * endpoint is available — the caller composer falls through to the
 * telemetry-only path so the user still sees *something*.
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

/**
 * Anthropic — no public per-API-key usage endpoint exists.
 *
 * Usage data is available org-wide in the Anthropic Console UI but is
 * not exposed via a programmatic API at the key level. This stub
 * returns null so the composer falls through to telemetry.
 *
 * Replace the body if Anthropic ships a per-key usage endpoint.
 */
export async function fetchAnthropicUsage(
  conn: ConnectionWithKey,
): Promise<UsageReport | null> {
  void conn;
  return null;
}

/**
 * Google (Gemini) — no per-key usage endpoint.
 *
 * Google Cloud billing is project-scoped, not key-scoped. The
 * Generative Language API doesn't expose per-key usage. This stub
 * returns null; the composer uses telemetry.
 *
 * Replace the body if Google ships a per-key usage endpoint.
 */
export async function fetchGoogleUsage(
  conn: ConnectionWithKey,
): Promise<UsageReport | null> {
  void conn;
  return null;
}
