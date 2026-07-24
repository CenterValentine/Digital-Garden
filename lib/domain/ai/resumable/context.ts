/**
 * Resumable stream context (AI 3.3) — lazy singleton around
 * `resumable-stream`, which buffers a tee of the chat SSE stream in
 * Redis and replays it to reconnecting clients (reload, second tab).
 *
 * `waitUntil` comes from @vercel/functions: on Vercel it extends the
 * function's lifetime so the Redis write pump survives past the HTTP
 * response; elsewhere it degrades to a plain fire-and-forget.
 * (next/server's `after` was considered and rejected — it requires live
 * request ALS scope, which a detached stream pump can outlive.)
 */

import { createResumableStreamContext } from "resumable-stream/ioredis";
import type {
  Publisher,
  ResumableStreamContext,
  Subscriber,
} from "resumable-stream/ioredis";
import { waitUntil } from "@vercel/functions";
import {
  getRedisPublisher,
  getRedisSubscriber,
  isResumableConfigured,
} from "./redis";

let cached: ResumableStreamContext | null | undefined;

/**
 * The process-wide resumable stream context, or null when REDIS_URL is
 * not configured (feature silently off).
 */
export function getStreamContext(): ResumableStreamContext | null {
  if (cached !== undefined) return cached;
  const publisher = getRedisPublisher();
  const subscriber = getRedisSubscriber();
  if (!isResumableConfigured() || !publisher || !subscriber) {
    cached = null;
    return cached;
  }
  cached = createResumableStreamContext({
    keyPrefix: "dg:resumable",
    waitUntil,
    // Raw ioredis instances: the factory duck-detects them (via
    // `defineCommand`) and wraps them in its own adapters, so the
    // node-redis-shaped Publisher/Subscriber types are only nominal here.
    publisher: publisher as unknown as Publisher,
    subscriber: subscriber as unknown as Subscriber,
  });
  return cached;
}
