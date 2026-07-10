/**
 * POST /api/cron/notifications-maintenance
 *
 * Daily Vercel Cron. Expires stale connection invites, applies notification
 * retention (archived recipients, old events), and sweeps rate-limit
 * windows. Protected by the shared CRON_SECRET (same pattern as
 * purge-trash / scheduled-publish).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { runMaintenance } from "@/lib/domain/notifications";
import { logger } from "@/lib/core/logger";
import { withRouteTrace } from "@/lib/core/logger/route-trace";

export async function POST(req: NextRequest) {
  return withRouteTrace(
    req,
    { route: "/api/cron/notifications-maintenance" },
    async () => {
      const authHeader = req.headers.get("authorization");
      if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        logger.warn({
          layer: "content",
          event: "cron_notifications_maintenance:rejected",
          summary: "missing or invalid cron secret",
          attrs: { reason: "unauthorized" },
        });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const result = await runMaintenance(prisma);
      logger.info({
        layer: "content",
        event: "cron_notifications_maintenance:completed",
        summary: "notification maintenance sweep finished",
        attrs: { ...result },
      });
      return NextResponse.json({ success: true, data: result });
    },
  );
}
