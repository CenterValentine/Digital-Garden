/**
 * Stream ↔ conversation association (AI 3.3).
 *
 * Redis-only by design (migration-free): maps an owner-scoped
 * conversation to the streamId of its most recent in-flight turn so a
 * reconnecting client can find the stream to re-attach to. The
 * userId in the key IS the authorization — a resume GET can only ever
 * look up the caller's own associations (owner-scoped ahead of Epoch 18
 * multi-tenancy). TTL'd so orphans self-expire; no cleanup job exists
 * or is needed. A new turn in the same conversation overwrites the key,
 * so the latest stream always wins.
 *
 * Every function is a clean no-op when Redis is unconfigured or down —
 * failures degrade to today's non-resumable behavior, never to errors
 * on the chat hot path.
 */

import { getRedisPublisher } from "./redis";
import { logger } from "@/lib/core/logger";

/** One hour — comfortably beyond the longest tool-loop turn. */
const ASSOCIATION_TTL_SECONDS = 60 * 60;

function associationKey(userId: string, conversationId: string): string {
  return `dg:resumable:assoc:${userId}:${conversationId}`;
}

/** Record `streamId` as the active stream for this owner's conversation. */
export async function associateStream(
  userId: string,
  conversationId: string,
  streamId: string,
): Promise<void> {
  const redis = getRedisPublisher();
  if (!redis) return;
  try {
    await redis.set(
      associationKey(userId, conversationId),
      streamId,
      "EX",
      ASSOCIATION_TTL_SECONDS,
    );
  } catch (error) {
    logger.warn({
      layer: "ai",
      event: "resumable:associate_failed",
      summary: "stream association write failed — this turn won't be resumable",
      error,
    });
  }
}

/** The active streamId for this owner's conversation, or null. */
export async function getActiveStreamId(
  userId: string,
  conversationId: string,
): Promise<string | null> {
  const redis = getRedisPublisher();
  if (!redis) return null;
  try {
    return await redis.get(associationKey(userId, conversationId));
  } catch (error) {
    logger.warn({
      layer: "ai",
      event: "resumable:lookup_failed",
      summary: "stream association lookup failed — treating as no active stream",
      error,
    });
    return null;
  }
}

/**
 * Clear the mapping when ITS stream's turn ends — any path: finish,
 * abort, error (owner smoke 2026-09-04: a Stopped turn's association
 * outlived its half-dead stream by up to the full TTL, so every revisit
 * re-attached and hung "thinking" forever). Guarded compare-then-delete:
 * a newer turn may already have overwritten the key, and deleting that
 * would cost the NEW turn its resumability. The get→del race window is
 * milliseconds and degrades to non-resumable, never to errors.
 */
export async function clearActiveStream(
  userId: string,
  conversationId: string,
  streamId: string,
): Promise<void> {
  const redis = getRedisPublisher();
  if (!redis) return;
  try {
    const key = associationKey(userId, conversationId);
    const current = await redis.get(key);
    if (current === streamId) await redis.del(key);
  } catch (error) {
    logger.warn({
      layer: "ai",
      event: "resumable:clear_failed",
      summary: "stream association clear failed — orphan will TTL out",
      error,
    });
  }
}
