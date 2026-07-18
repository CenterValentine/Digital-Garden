/**
 * Cross-provider rate-limit retry middleware.
 *
 * Wraps both generate and stream calls. When a rate-limit error (HTTP 429 or
 * provider-specific message) is detected before a response begins, the
 * middleware waits — using the provider-supplied retry-after time when
 * available, falling back to exponential backoff — then retries.
 *
 * Works with OpenAI, Anthropic, Google, Vercel AI Gateway, and any provider
 * that either sets a Retry-After header or embeds the wait time in the error
 * message. Does not retry errors that are not rate-limit related.
 */

import type { LanguageModelMiddleware } from "ai";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  // Standard HTTP 429 — surfaced by AI SDK as statusCode on APICallError
  if (
    "statusCode" in error &&
    (error as { statusCode: unknown }).statusCode === 429
  ) {
    return true;
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("rate_limit") ||
      msg.includes("rate limit") ||
      msg.includes("resource_exhausted") || // Google
      msg.includes("too many requests") ||
      msg.includes("tokens per min") || // OpenAI TPM message
      msg.includes("requests per min") // OpenAI RPM message
    );
  }
  return false;
}

/**
 * Extract a concrete wait duration from the error, if the provider gave one.
 *
 * Checks:
 *  1. Retry-After / x-ratelimit-reset-requests response header
 *  2. OpenAI error message format: "Please try again in 6.604s"
 *
 * Returns milliseconds, or null when nothing useful was found.
 */
function extractRetryAfterMs(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;

  const headers = (
    error as { responseHeaders?: Record<string, string> }
  ).responseHeaders;
  if (headers) {
    const raw =
      headers["retry-after"] ?? headers["x-ratelimit-reset-requests"];
    if (raw) {
      const seconds = parseFloat(raw);
      if (!isNaN(seconds) && seconds > 0) return Math.ceil(seconds * 1000);
    }
  }

  if (error instanceof Error) {
    // Both "try again in 6.604s" and "try again in 196ms" occur in the
    // wild (the ms form slipped past the original s-only regex and fell
    // back to slow exponential backoff). Small cushion added — provider
    // retry-afters are optimistic under rolling TPM windows.
    const match = error.message.match(/try again in ([\d.]+)\s*(ms|s)\b/i);
    if (match?.[1] && match[2]) {
      const value = parseFloat(match[1]);
      const ms = match[2].toLowerCase() === "ms" ? value : value * 1000;
      if (!isNaN(ms) && ms > 0) return Math.ceil(ms + 250);
    }
  }

  return null;
}

export interface RateLimitRetryOptions {
  /**
   * Maximum number of retries after the initial attempt. Default: 5 —
   * sized for rolling TPM windows: agent-loop steps saturate the window
   * themselves, so waits must be long enough for tokens to age out
   * (1+2+4+8+16s ≈ 31s of patience against a 60s window).
   */
  maxRetries?: number;
  /** Base delay for exponential backoff when no retry-after hint is given. Default: 1000ms */
  baseDelayMs?: number;
  /** Upper bound on any computed delay. Default: 30_000ms */
  maxDelayMs?: number;
}

export function rateLimitRetryMiddleware(
  options: RateLimitRetryOptions = {},
): LanguageModelMiddleware {
  const { maxRetries = 5, baseDelayMs = 1000, maxDelayMs = 30_000 } = options;

  async function withRetry<T>(fn: () => PromiseLike<T>): Promise<T> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        const isLast = attempt === maxRetries;
        if (!isRateLimitError(error) || isLast) throw error;

        const suggested = extractRetryAfterMs(error);
        const backoff = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
        await sleep(suggested ?? backoff);
      }
    }
    // Unreachable — the loop always either returns or throws. TypeScript needs
    // this to be satisfied for the return type.
    throw new Error("Rate limit retry exhausted");
  }

  return {
    specificationVersion: "v3",
    wrapGenerate: ({ doGenerate }) => withRetry(doGenerate),
    wrapStream: ({ doStream }) => withRetry(doStream),
  };
}
