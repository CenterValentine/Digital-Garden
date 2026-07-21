/**
 * DB-backed fixed-window rate limiter.
 *
 * One atomic upsert-increment per check against RateLimitCounter, keyed by
 * (key, windowStart). Fixed windows are adequate at this deployment's scale
 * and avoid introducing Redis. Stale windows are swept by the notifications
 * maintenance cron.
 */

import { prisma } from "@/lib/database/client";
import type { PrismaClient, Prisma } from "@/lib/database/generated/prisma";

type RateLimitPrismaClient = PrismaClient | Prisma.TransactionClient;

export interface ConsumeRateLimitOptions {
  /** Namespaced counter key, e.g. "invite:<userId>" */
  key: string;
  /** Maximum operations allowed per window */
  limit: number;
  /** Window length in seconds */
  windowSeconds: number;
  db?: RateLimitPrismaClient;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export const RATE_LIMITS = {
  CONNECTION_INVITES_PER_HOUR: { limit: 3, windowSeconds: 3_600 },
  CONNECTION_INVITES_PER_DAY: { limit: 10, windowSeconds: 86_400 },
  DM_MESSAGES_PER_HOUR: { limit: 120, windowSeconds: 3_600 },
  AI_NOTIFY_PER_HOUR: { limit: 10, windowSeconds: 3_600 },
} as const;

export async function consumeRateLimit(
  options: ConsumeRateLimitOptions,
): Promise<RateLimitResult> {
  const { key, limit, windowSeconds } = options;
  const db = options.db ?? prisma;

  const windowMs = windowSeconds * 1_000;
  const nowMs = Date.now();
  const windowStartMs = Math.floor(nowMs / windowMs) * windowMs;
  const windowStart = new Date(windowStartMs);

  const counter = await db.rateLimitCounter.upsert({
    where: { key_windowStart: { key, windowStart } },
    update: { count: { increment: 1 } },
    create: { key, windowStart, count: 1 },
  });

  const ok = counter.count <= limit;
  return {
    ok,
    remaining: Math.max(0, limit - counter.count),
    retryAfterSeconds: ok
      ? 0
      : Math.ceil((windowStartMs + windowMs - nowMs) / 1_000),
  };
}

/** Delete counter rows whose window ended more than `olderThanSeconds` ago. */
export async function sweepStaleRateLimitCounters(
  db: RateLimitPrismaClient,
  olderThanSeconds = 172_800,
): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanSeconds * 1_000);
  const result = await db.rateLimitCounter.deleteMany({
    where: { windowStart: { lt: cutoff } },
  });
  return result.count;
}
