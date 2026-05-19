/**
 * Execute-with-fallback — Session 3.6.
 *
 * Wraps an AI call so it tries each route in order, falling through
 * on retriable errors only. Fatal errors abort the entire chain.
 *
 *   Retriable: 429 (rate limit), 502, 503, 504, network timeout,
 *              ECONNRESET, ETIMEDOUT, generic 5xx not in the abort list.
 *   Fatal:     400 (bad input — same prompt fails on backup), 401
 *              (invalid key), 402 (BYOK required), 403 (forbidden),
 *              404 (model not found — backup might fix it, but
 *              treat as fatal so users see the misconfig).
 *
 * Telemetry: one span event per attempt with `feature_id`,
 * `attempt_index`, `connection_id`, `outcome`.
 */

import "server-only";
import { logger } from "@/lib/core/logger";
import type { ResolvedRoute } from "./router";

export interface ExecuteAttemptContext {
  /** The resolved route for this attempt. */
  route: ResolvedRoute;
  /** Index in the route list (0 = primary). */
  attemptIndex: number;
  /** True when this is the last available route. */
  isLast: boolean;
}

export interface ExecuteWithFallbackOptions<T> {
  featureId: string;
  routes: ResolvedRoute[];
  /** Called once per route until one succeeds or the chain exhausts. */
  attempt: (ctx: ExecuteAttemptContext) => Promise<T>;
}

export class NoRoutesAvailableError extends Error {
  constructor(featureId: string) {
    super(
      `No routes configured for feature "${featureId}" and no default could be resolved.`,
    );
    this.name = "NoRoutesAvailableError";
  }
}

export class AllRoutesExhaustedError extends Error {
  readonly lastError: unknown;
  constructor(featureId: string, lastError: unknown) {
    super(
      `All routes for feature "${featureId}" failed. Last error: ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`,
    );
    this.name = "AllRoutesExhaustedError";
    this.lastError = lastError;
  }
}

export async function executeWithFallback<T>(
  options: ExecuteWithFallbackOptions<T>,
): Promise<T> {
  const { featureId, routes, attempt } = options;
  if (routes.length === 0) {
    throw new NoRoutesAvailableError(featureId);
  }

  let lastError: unknown = null;
  for (let i = 0; i < routes.length; i++) {
    const route = routes[i];
    const isLast = i === routes.length - 1;
    try {
      const result = await attempt({ route, attemptIndex: i, isLast });
      logger.info({
        layer: "ai",
        event: "feature_route.attempt",
        summary: `${featureId} attempt ${i} ok`,
        attrs: {
          feature_id: featureId,
          attempt_index: i,
          connection_id: route.connection.id,
          model_id: route.modelId,
          outcome: "ok",
        },
      });
      return result;
    } catch (err) {
      lastError = err;
      const retriable = isRetriable(err);
      logger.warn({
        layer: "ai",
        event: "feature_route.attempt",
        summary: `${featureId} attempt ${i} failed (${retriable ? "retriable" : "fatal"})`,
        attrs: {
          feature_id: featureId,
          attempt_index: i,
          connection_id: route.connection.id,
          model_id: route.modelId,
          outcome: retriable ? "retry" : "fatal",
        },
        error: err,
      });
      if (!retriable || isLast) {
        throw err;
      }
      // Try next route.
    }
  }

  throw new AllRoutesExhaustedError(featureId, lastError);
}

/**
 * Classify an error as retriable (fall through to next route) or
 * fatal (abort). Conservative: when in doubt, abort — falling through
 * on a bad-prompt error would hammer multiple providers for nothing.
 */
export function isRetriable(error: unknown): boolean {
  if (!error) return false;

  // Network-level errors — retriable.
  const code = (error as { code?: string }).code;
  if (code === "ECONNRESET" || code === "ETIMEDOUT" || code === "ENOTFOUND") {
    return true;
  }
  if (error instanceof Error && /timeout/i.test(error.message)) return true;

  // HTTP-status errors. AI SDK wraps these with a numeric statusCode
  // on the error object (varies by provider — we check several shapes).
  const status =
    (error as { statusCode?: number }).statusCode ??
    (error as { status?: number }).status ??
    (error as { response?: { status?: number } }).response?.status;

  if (typeof status === "number") {
    // Retriable HTTP statuses.
    if (status === 429) return true;        // Rate limit
    if (status === 408) return true;        // Request timeout
    if (status === 502) return true;        // Bad gateway
    if (status === 503) return true;        // Service unavailable
    if (status === 504) return true;        // Gateway timeout
    // Fatal HTTP statuses.
    if (status === 400) return false;        // Bad request — same prompt fails on backup
    if (status === 401) return false;        // Auth — key invalid
    if (status === 402) return false;        // BYOK required
    if (status === 403) return false;        // Forbidden
    if (status === 404) return false;        // Model not found — explicit misconfig
    // Other 5xx — generously retriable.
    if (status >= 500) return true;
    // Other 4xx — fatal.
    return false;
  }

  // Unknown error shape — be conservative.
  return false;
}
