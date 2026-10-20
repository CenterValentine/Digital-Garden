/**
 * Backoff policy for outbound research calls (client-safe, pure).
 *
 * The sources ask clients to back off on 429 (Semantic Scholar's terms say
 * so in as many words). This decides how long to wait before a retry:
 *
 * - `Retry-After` wins when the source sends one (seconds, or an HTTP date),
 *   and is never shortened — a wait we can't afford means "not now".
 * - Otherwise exponential: base × 2^attempt, with full jitter so a burst of
 *   searches doesn't retry in lockstep.
 * - Never past the budget: a wait that would overrun the per-source timeout
 *   is refused (null), and the caller reports the source as busy instead.
 */

export interface BackoffPolicy {
  /** Retries after the first attempt. */
  maxRetries: number;
  baseMs: number;
  maxDelayMs: number;
}

export const RESEARCH_BACKOFF: BackoffPolicy = { maxRetries: 2, baseMs: 600, maxDelayMs: 4_000 };

/** `Retry-After` header → milliseconds, or null when absent / unparseable. */
export function parseRetryAfter(header: string | null | undefined, now = Date.now()): number | null {
  if (!header) return null;
  const value = header.trim();
  if (/^\d+$/.test(value)) return Number(value) * 1000;
  const at = Date.parse(value);
  if (Number.isNaN(at)) return null;
  return Math.max(0, at - now);
}

/**
 * The delay before retry number `attempt` (1-based), or null to give up.
 * `elapsedMs` is time already spent on this call; `budgetMs` the per-source
 * timeout. `random` is injectable for the gate.
 */
export function backoffDelay(
  attempt: number,
  options: {
    retryAfterMs?: number | null;
    elapsedMs: number;
    budgetMs: number;
    policy?: BackoffPolicy;
    random?: () => number;
  }
): number | null {
  const policy = options.policy ?? RESEARCH_BACKOFF;
  if (attempt > policy.maxRetries) return null;
  const random = options.random ?? Math.random;
  const exponential = Math.min(policy.maxDelayMs, policy.baseMs * 2 ** (attempt - 1));
  const jittered = Math.round(exponential * (0.5 + random() * 0.5));
  // A Retry-After is the source's own instruction: honour it in full, never
  // shorten it. When it doesn't fit the budget, that means "not now".
  const delay =
    options.retryAfterMs !== null && options.retryAfterMs !== undefined ? Math.max(options.retryAfterMs, 0) : jittered;
  // Leave room for the retried request itself (a second, at least).
  if (options.elapsedMs + delay + 1_000 > options.budgetMs) return null;
  return delay;
}
