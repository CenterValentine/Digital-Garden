/**
 * Acquisition API (BROWSER-REACH B5).
 *
 * POST /api/ai/acquisition
 *   { url }                    → P1 server-fetch (in-process). The client calls
 *                                this first; a bot-hostile page fails here.
 *   { url, remote: {...} }     → finalize extension-fetched material (P2/P3):
 *                                the client, after P1 fails, asks the extension
 *                                to fetch with the user's session and posts the
 *                                raw material here to be turned into a trusted
 *                                envelope. This is the client-mediated P1→P3
 *                                escalation (the server can't reach the browser).
 *
 * Both paths re-run the server acquisition policy (defense-in-depth). A policy
 * denial or a fetch failure is returned as `success:false` with a reason (HTTP
 * 200) — a normal outcome the client acts on, not a transport error.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { logger, withRouteTrace } from "@/lib/core/logger";
import { acquire, createAcquisitionBudget } from "@/lib/domain/ai/acquisition";
import {
  finalizeRemoteAcquire,
  type RemoteAcquireMaterial,
} from "@/lib/domain/ai/acquisition/remote-acquire";

const ROUTE_PATH = "/api/ai/acquisition";

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await requireAuth();
      const body = await request.json();
      const url = typeof body?.url === "string" ? body.url : "";
      if (!url) {
        return NextResponse.json(
          {
            success: false,
            error: { code: "INVALID_REQUEST", message: "url is required" },
          },
          { status: 400 },
        );
      }

      const ctx = {
        userId: session.user.id,
        budget: createAcquisitionBudget(),
      };

      const remote = body?.remote as RemoteAcquireMaterial | undefined;
      const isRemote =
        remote &&
        (remote.mode === "sw-fetch" || remote.mode === "session-tab");

      const result = isRemote
        ? await finalizeRemoteAcquire(url, remote, ctx)
        : await acquire({ url }, ctx);

      if (!result.ok) {
        // Expected negative outcome (blocked/denied/thin) — 200 so the client
        // can read the reason and escalate P1 → P3 rather than treating it as
        // a transport failure.
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "ACQUIRE_FAILED",
              message: result.reason ?? "acquisition failed",
            },
          },
          { status: 200 },
        );
      }

      return NextResponse.json({ success: true, data: result.content });
    } catch (error) {
      logger.error({
        layer: "ai",
        event: "acquisition:route:caught",
        summary: "acquisition route failed — 500",
        error,
      });
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message:
              error instanceof Error ? error.message : "Internal server error",
          },
        },
        { status: 500 },
      );
    }
  });
}
