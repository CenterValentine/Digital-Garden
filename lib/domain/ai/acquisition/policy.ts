/**
 * Acquisition policy engine — core (AI v3 core S2).
 *
 * Every acquisition request passes through here regardless of provider or
 * consumer. v1 scope: protocol + SSRF guard, per-turn page budgets, and a
 * deny-by-category seam ready for user-configurable allow/deny/ask lists.
 * The audit log lives at the acquire() entry point, not here.
 */

import type { AcquireContext } from "./types";

/**
 * Flat shape (not a discriminated union): the repo compiles with
 * `strict: false`, where boolean-discriminant narrowing is unreliable.
 * `reason` is present exactly when `allowed` is false.
 */
export interface AcquireDecision {
  allowed: boolean;
  reason?: string;
}

/**
 * Private/internal network guard. Server-side fetch on behalf of a model is
 * an SSRF vector — a hostile page could ask the agent to "read"
 * http://169.254.169.254/ or an internal service. Block private ranges and
 * loopback outright; no configuration can re-enable them.
 */
const BLOCKED_HOSTNAMES = new Set(["localhost", "0.0.0.0", "[::1]", "::1"]);

const BLOCKED_HOST_SUFFIXES = [".local", ".internal", ".localdomain"];

function isPrivateIpv4(hostname: string): boolean {
  const m = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  return false;
}

function isPrivateIpv6(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80");
}

export function evaluateAcquirePolicy(
  rawUrl: string,
  ctx: AcquireContext,
): AcquireDecision {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { allowed: false, reason: "invalid URL" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { allowed: false, reason: "only http/https URLs are allowed" };
  }

  const hostname = url.hostname.toLowerCase();
  if (
    BLOCKED_HOSTNAMES.has(hostname) ||
    BLOCKED_HOST_SUFFIXES.some((s) => hostname.endsWith(s)) ||
    isPrivateIpv4(hostname) ||
    isPrivateIpv6(hostname)
  ) {
    return {
      allowed: false,
      reason: "private and internal network addresses are blocked",
    };
  }

  if (ctx.budget) {
    if (ctx.budget.pagesUsed >= ctx.budget.maxPages) {
      return {
        allowed: false,
        reason: `page budget reached (${ctx.budget.maxPages} per turn)`,
      };
    }
    ctx.budget.pagesUsed += 1;
  }

  return { allowed: true };
}
