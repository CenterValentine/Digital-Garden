/**
 * POST /api/cron/purge-note-history
 *
 * Daily Vercel Cron. Removes note snapshots (`ContentHistory`) older than
 * the one-day retention window (owner, 2026-10-12). Pruning also runs on
 * every record, but a note that is never rewritten again would otherwise
 * keep its last snapshot forever. Protected by CRON_SECRET like the other
 * cron routes.
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/core/logger";
import { withRouteTrace } from "@/lib/core/logger/route-trace";
import { purgeExpiredNoteHistory } from "@/lib/domain/content/note-history";

export async function POST(req: NextRequest) {
  return withRouteTrace(req, { route: "/api/cron/purge-note-history" }, async () => {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      logger.warn({
        layer: "content",
        event: "cron_purge_note_history:rejected",
        summary: "missing or invalid cron secret",
        attrs: { reason: "unauthorized" },
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const removed = await purgeExpiredNoteHistory();
    logger.info({
      layer: "content",
      event: "cron_purge_note_history:done",
      summary: `${removed} expired note snapshot(s) removed`,
      attrs: { removed },
    });
    return NextResponse.json({ success: true, data: { removed } });
  });
}
