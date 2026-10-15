/**
 * Cache volley (ITERATION-RUN-HARNESS-FIXES §10 round 3, owner-requested
 * 2026-09-30). A turn that stops on a pending approval leaves its prompt in
 * the provider's cache; if the owner answers after the cache has expired,
 * the continuation re-sends the whole prompt at full price. One volley —
 * a single one-token request that REUSES the cached prefix, which refreshes
 * its lifetime — keeps it warm through a 10-minute window.
 *
 * Only where it buys something: providers whose cache outlives an approval
 * on its own (OpenAI GPT-5.6 and later keep a prefix 30 minutes after its
 * last use) get no volley, and providers with no cache we control get none.
 *
 * PURE AND CLIENT-SAFE — the chat engine schedules the volley; the route
 * rebuilds the prompt through its normal path so the prefix is identical.
 */

import type { UIMessage } from "ai";

/** How long a pending approval is kept warm. */
export const CACHE_VOLLEY_WINDOW_MS = 10 * 60_000;
/** Fire this long before the cache would expire. */
export const CACHE_VOLLEY_LEAD_MS = 60_000;

function splitVendor(
  providerId: string | null | undefined,
  modelId: string,
): { vendor: string | null; id: string } {
  const lower = modelId.toLowerCase();
  if (lower.includes("/")) {
    const [vendor, ...rest] = lower.split("/");
    return { vendor, id: rest.join("/") };
  }
  return { vendor: providerId?.toLowerCase() ?? null, id: lower };
}

/**
 * The provider cache's lifetime after last use, in minutes; null when there
 * is no cache we can keep warm.
 *  - Anthropic: 5 (ephemeral breakpoints, refreshed on every hit).
 *  - OpenAI GPT-5.6 and later (gpt-6 included): 30 — "A cached prefix
 *    remains eligible for reuse for 30 minutes after its most recent write
 *    or reuse" (prompt-caching guide, 2026-09-30).
 *  - Earlier OpenAI caching models (gpt-4o, gpt-4.1, gpt-5 through 5.5,
 *    o-series): 5 — "around 5 to 10 minutes of inactivity"; the floor.
 */
export function cacheLifetimeMinutes(
  providerId: string | null | undefined,
  modelId: string | null | undefined,
): number | null {
  if (!modelId) return null;
  const { vendor, id } = splitVendor(providerId, modelId);
  if (vendor === "anthropic" || id.startsWith("claude-")) return 5;
  if (vendor !== "openai") return null;
  if (/^gpt-([6-9]|\d{2,})(?:$|[.-])/.test(id) || /^gpt-5\.([6-9]|\d{2,})(?:$|[.-])/.test(id)) {
    return 30;
  }
  if (
    /^gpt-4o(?:$|-)/.test(id) ||
    /^chatgpt-4o(?:$|-)/.test(id) ||
    /^gpt-4\.1(?:$|-)/.test(id) ||
    /^gpt-5(?:$|[.-])/.test(id) ||
    /^o[134](?:$|-)/.test(id)
  ) {
    return 5;
  }
  return null;
}

/**
 * When to fire the volley after the turn stopped, or null for no volley:
 * only when the cache would expire inside the window. One volley at
 * (lifetime − lead) carries the cache to roughly twice its lifetime.
 */
export function cacheVolleyDelayMs(
  providerId: string | null | undefined,
  modelId: string | null | undefined,
): number | null {
  const minutes = cacheLifetimeMinutes(providerId, modelId);
  if (minutes === null) return null;
  const lifetimeMs = minutes * 60_000;
  if (lifetimeMs >= CACHE_VOLLEY_WINDOW_MS) return null;
  return Math.max(0, lifetimeMs - CACHE_VOLLEY_LEAD_MS);
}

/**
 * A stable key for the approvals the last assistant message is waiting on,
 * or null when nothing is pending. One volley per key.
 */
export function pendingApprovalKey(messages: readonly UIMessage[]): string | null {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant") return null;
  const ids: string[] = [];
  for (const part of last.parts) {
    const p = part as { state?: string; approval?: { id?: string }; toolCallId?: string };
    if (p.state === "approval-requested") ids.push(p.approval?.id ?? p.toolCallId ?? "?");
  }
  return ids.length > 0 ? `${last.id}:${ids.join(",")}` : null;
}

/**
 * The transcript as the approval-requesting STEP saw it: the last assistant
 * message cut at its final `step-start`. That step's prompt is the cached
 * prefix the continuation will extend, so a request built from it reuses
 * the whole cache without asking the model to act on the pending call.
 */
export function trimToLastStepStart(messages: readonly UIMessage[]): UIMessage[] {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant") return [...messages];
  let cut = -1;
  last.parts.forEach((part, i) => {
    if ((part as { type?: string }).type === "step-start") cut = i;
  });
  if (cut < 0) return messages.slice(0, -1);
  const parts = last.parts.slice(0, cut);
  const hasContent = parts.some((p) => (p as { type?: string }).type !== "step-start");
  return hasContent
    ? [...messages.slice(0, -1), { ...last, parts }]
    : messages.slice(0, -1);
}
