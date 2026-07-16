import { NextRequest, NextResponse } from "next/server";

import { withRouteTrace } from "@/lib/core/logger";
import { markRunning } from "@/extensions/workflows/server/runs";
import {
  handleCallbackError,
  requireCallbackRun,
} from "@/extensions/workflows/server/callback";

const ROUTE_PATH = "/api/workflows/callback/runs/[id]/running";

type Params = Promise<{ id: string }>;

/** Engine callback: mark a queued/waiting run as running (it started executing). */
export async function POST(
  request: NextRequest,
  { params }: { params: Params }
) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const { id } = await params;
      const { run } = await requireCallbackRun(request, id);
      await markRunning(run.id);
      return NextResponse.json({
        success: true,
        data: { runId: run.id, status: "running" },
      });
    } catch (error) {
      return handleCallbackError(error, "Failed to mark run running");
    }
  });
}
