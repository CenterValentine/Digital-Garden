/**
 * Daily spend accounting for the auto-context refresh engine.
 *
 * Counts LLM requests ("generation calls") per user per UTC day — one packed
 * leaf batch = one call, one folder roll-up = one call. The manual per-node
 * Generate button is deliberately NOT counted: a human click rate-limits
 * itself; the ceiling exists to bound the AUTOMATED cascade.
 *
 * Soft ceiling by design: the engine checks before starting and before each
 * call, then records once per drain — concurrent drains can overshoot by at
 * most one per-run cap, which is fine for a cost guard (this is a budget,
 * not a billing system).
 */

import { prisma } from "@/lib/database/client";

/** Today's key, UTC — string keying keeps day resets timezone-simple. */
export function utcDayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Generation calls the user's engine drains have made today. */
export async function getTodaySpend(userId: string): Promise<number> {
  const row = await prisma.studioContextSpend.findUnique({
    where: { ownerId_day: { ownerId: userId, day: utcDayKey() } },
    select: { generationCalls: true },
  });
  return row?.generationCalls ?? 0;
}

/** Record a drain's calls (atomic increment; row created on first spend). */
export async function recordSpend(
  userId: string,
  generationCalls: number
): Promise<void> {
  if (generationCalls <= 0) return;
  await prisma.studioContextSpend.upsert({
    where: { ownerId_day: { ownerId: userId, day: utcDayKey() } },
    create: { ownerId: userId, day: utcDayKey(), generationCalls },
    update: { generationCalls: { increment: generationCalls } },
  });
}
