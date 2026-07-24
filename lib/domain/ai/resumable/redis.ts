/**
 * Redis client layer for resumable streams (AI 3.3).
 *
 * Lazily constructs two long-lived ioredis connections from REDIS_URL —
 * a plain command client (doubles as the resumable-stream publisher and
 * the association layer's GET/SET connection) and a dedicated
 * subscriber. Redis pub/sub locks a connection into subscribe mode, so
 * the subscriber can never share the command connection. REDIS_URL must
 * be Upstash's TCP endpoint (`redis://…`) — the REST API cannot hold
 * persistent pub/sub subscriptions.
 *
 * Graceful degradation is the core contract: without REDIS_URL every
 * getter returns null and the chat pipeline behaves byte-for-byte as it
 * did before this feature existed — no throws, no log spam.
 */

import Redis from "ioredis";
import { logger } from "@/lib/core/logger";

/**
 * The TCP Redis endpoint (`redis://` or `rediss://`). This project's
 * Vercel Upstash integration provisions env vars with a `dg_` prefix
 * (`dg_REDIS_URL`), so both names are accepted; a plain REDIS_URL wins
 * when present. The REST pair (dg_KV_REST_API_*) is deliberately NOT
 * consulted — REST cannot hold persistent pub/sub subscriptions.
 */
function resolveRedisUrl(): string | null {
  return process.env.REDIS_URL ?? process.env.dg_REDIS_URL ?? null;
}

/** True when a Redis endpoint is configured (the feature's master gate). */
export function isResumableConfigured(): boolean {
  return !!resolveRedisUrl();
}

// globalThis-cached so dev hot-reload doesn't leak connections (same
// pattern as the Prisma singleton in lib/database/client.ts).
const globalForResumable = globalThis as unknown as {
  dgResumablePublisher?: Redis;
  dgResumableSubscriber?: Redis;
};

// Throttle connection-error logging: during an outage ioredis retries on
// an interval and emits an error per attempt — one structured warning a
// minute is signal, one per attempt is spam.
const lastErrorLoggedAt: Record<string, number> = {};
const ERROR_LOG_INTERVAL_MS = 60_000;

function createClient(role: "publisher" | "subscriber"): Redis {
  const client = new Redis(resolveRedisUrl() as string, {
    // Fail fast: a down Redis should degrade the feature (callers catch
    // and no-op), never stall the chat hot path behind command retries.
    maxRetriesPerRequest: 1,
    retryStrategy: (times) => Math.min(times * 500, 5_000),
  });
  client.on("error", (error) => {
    const now = Date.now();
    if (now - (lastErrorLoggedAt[role] ?? 0) < ERROR_LOG_INTERVAL_MS) return;
    lastErrorLoggedAt[role] = now;
    logger.warn({
      layer: "ai",
      event: "resumable:redis_error",
      summary: `resumable-streams redis ${role} connection error — feature degrades to non-resumable`,
      error,
    });
  });
  return client;
}

/**
 * Plain command connection: resumable-stream publisher + association
 * reads/writes. Null when REDIS_URL is absent.
 */
export function getRedisPublisher(): Redis | null {
  if (!isResumableConfigured()) return null;
  if (!globalForResumable.dgResumablePublisher) {
    globalForResumable.dgResumablePublisher = createClient("publisher");
  }
  return globalForResumable.dgResumablePublisher;
}

/**
 * Dedicated pub/sub subscriber connection. Null when REDIS_URL is
 * absent. Never issue normal commands on this client.
 */
export function getRedisSubscriber(): Redis | null {
  if (!isResumableConfigured()) return null;
  if (!globalForResumable.dgResumableSubscriber) {
    globalForResumable.dgResumableSubscriber = createClient("subscriber");
  }
  return globalForResumable.dgResumableSubscriber;
}
