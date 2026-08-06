/**
 * POST /api/cron/studio-context-sweep
 *
 * Nightly Vercel Cron. Drains stale AI context (Folder Studio auto-context)
 * tree-wide for users on the "on-access-sweep" mode, in bounded batches —
 * see runContextSweep for the cap stack. Protected by the shared
 * CRON_SECRET (same pattern as purge-trash / notifications-maintenance).
 */

import { NextRequest, NextResponse } from "next/server";
import { runContextSweep } from "@/lib/domain/ai-context/context-refresh";
import { logger } from "@/lib/core/logger";
import { withRouteTrace } from "@/lib/core/logger/route-trace";

export async function POST(req: NextRequest) {
  return withRouteTrace(
    req,
    { route: "/api/cron/studio-context-sweep" },
    async () => {
      const authHeader = req.headers.get("authorization");
      if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        logger.warn({
          layer: "ai",
          event: "cron_studio_context_sweep:rejected",
          summary: "missing or invalid cron secret",
          attrs: { reason: "unauthorized" },
        });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const result = await runContextSweep();
      return NextResponse.json({ success: true, data: result });
    }
  );
}
