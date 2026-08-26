/**
 * POST /api/cron/dormant-workbenches
 *
 * Daily sweep for folder-derived sub-workspaces (workbenches) that have come
 * detached from their parent's view — folder moved out, folder trashed, parent
 * retargeted or archived.
 *
 * Deliberately self-healing: dormancy is DERIVED on each run rather than
 * stamped by write paths, so no delete/move/retarget handler has to remember
 * to mark anything. A missed signal delays a stamp by one day instead of
 * leaking a row forever. Re-attaching clears the stamp, which is what makes
 * "dormant but restorable" real — retarget a parent back and the workbench
 * returns with its pane layout intact.
 *
 * Rows dormant beyond the parent's clearout window are deleted. The window is
 * per-workspace (`settings.workbenches.dormantClearoutDays`, default 30,
 * clamped 1-365).
 *
 * Protected by the shared CRON_SECRET, same as purge-trash.
 */

import { NextRequest, NextResponse } from "next/server";
import { sweepDormantWorkbenches } from "@/extensions/workplaces/server/service";
import { logger } from "@/lib/core/logger";
import { withRouteTrace } from "@/lib/core/logger/route-trace";

export async function POST(req: NextRequest) {
  return withRouteTrace(
    req,
    { route: "/api/cron/dormant-workbenches" },
    async () => {
      const authHeader = req.headers.get("authorization");
      if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        logger.warn({
          layer: "route",
          event: "cron_dormant_workbenches:rejected",
          summary: "missing or invalid cron secret",
          attrs: { reason: "unauthorized" },
        });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const result = await sweepDormantWorkbenches(new Date());
      logger.info({
        layer: "route",
        event: "cron_dormant_workbenches:swept",
        summary: `stamped ${result.stamped}, cleared ${result.cleared}, deleted ${result.deleted}`,
        attrs: result,
      });
      return NextResponse.json({ success: true, data: result });
    }
  );
}
