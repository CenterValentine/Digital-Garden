import "server-only";

/**
 * Note history — the writer `ContentHistory` never had.
 *
 * `recordNoteHistory` keeps the document a serializer-driven write is about
 * to replace. It NEVER throws: a failed backup is logged, and the write it
 * protects proceeds, because refusing a user's edit over a bookkeeping
 * failure would be worse than the (rare) missing snapshot. Versions are
 * per note and monotonic; the unique index on (contentId, version) makes a
 * concurrent race a retry rather than a duplicate.
 */

import type { JSONContent } from "@tiptap/core";
import { prisma } from "@/lib/database/client";
import type { Prisma } from "@/lib/database/generated/prisma";
import { logger } from "@/lib/core/logger";
import {
  buildNoteHistoryEnvelope,
  historyCutoff,
  pruneBelowVersion,
  type NoteHistorySource,
} from "./note-history-envelope";

export interface RecordNoteHistoryInput {
  contentId: string;
  changedBy: string;
  snapshot: JSONContent | null | undefined;
  source: NoteHistorySource;
  mode?: "replace" | "append";
  route?: string;
}

export async function recordNoteHistory(
  input: RecordNoteHistoryInput
): Promise<{ version: number } | null> {
  const envelope = buildNoteHistoryEnvelope({
    source: input.source,
    tiptapJson: input.snapshot,
    mode: input.mode,
    route: input.route,
    capturedAt: new Date(),
  });
  if (!envelope) return null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const latest = await prisma.contentHistory.findFirst({
        where: { contentId: input.contentId },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      const version = (latest?.version ?? 0) + 1;
      await prisma.contentHistory.create({
        data: {
          contentId: input.contentId,
          version,
          changedBy: input.changedBy,
          snapshot: envelope as unknown as Prisma.InputJsonValue,
        },
      });
      // Prune by AGE across EVERY note (one-day window) — no cron needed:
      // the table is small and any write anywhere sweeps it — then by count
      // for this note as a safety cap within the day.
      await purgeExpiredNoteHistory();
      const floor = pruneBelowVersion(version);
      if (floor > 0) {
        await prisma.contentHistory.deleteMany({
          where: { contentId: input.contentId, version: { lte: floor } },
        });
      }
      return { version };
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "P2002" && attempt === 0) continue; // raced on the version — once more
      logger.warn({
        layer: "content",
        event: "note_history:record_failed",
        summary: "pre-write snapshot was not recorded; the write proceeds",
        attrs: { content_id: input.contentId, source: input.source },
        error,
      });
      return null;
    }
  }
  return null;
}

/** Newest first, within the retention window. The restore affordance reads this. */
export async function listNoteHistory(contentId: string, limit = 20) {
  return prisma.contentHistory.findMany({
    where: { contentId, changedAt: { gte: historyCutoff(new Date()) } },
    orderBy: { version: "desc" },
    take: limit,
    select: { id: true, version: true, changedAt: true, changedBy: true, snapshot: true },
  });
}

/**
 * Remove every expired snapshot in the table. Called on each record, so a
 * note that is never rewritten again is still swept by the next write to
 * any other note. Returns the number of rows removed.
 */
export async function purgeExpiredNoteHistory(now: Date = new Date()): Promise<number> {
  const result = await prisma.contentHistory.deleteMany({
    where: { changedAt: { lt: historyCutoff(now) } },
  });
  return result.count;
}
