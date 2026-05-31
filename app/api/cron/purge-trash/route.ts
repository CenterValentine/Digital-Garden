/**
 * POST /api/cron/purge-trash
 *
 * Daily Vercel Cron. Hard-deletes soft-deleted chats + content past the
 * 30-day retention window and cleans up their attachment blobs. Protected
 * by the shared CRON_SECRET (same pattern as scheduled-publish).
 */

import { NextRequest, NextResponse } from "next/server";
import { purgeExpiredTrash } from "@/lib/features/trash";
import { logger } from "@/lib/core/logger";
import { withRouteTrace } from "@/lib/core/logger/route-trace";

export async function POST(req: NextRequest) {
  return withRouteTrace(req, { route: "/api/cron/purge-trash" }, async () => {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      logger.warn({
        layer: "ai",
        event: "cron_purge_trash:rejected",
        summary: "missing or invalid cron secret",
        attrs: { reason: "unauthorized" },
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await purgeExpiredTrash();
    return NextResponse.json({ success: true, data: result });
  });
}
