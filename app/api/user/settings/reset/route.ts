/**
 * User Settings Reset API
 *
 * POST /api/user/settings/reset - Reset settings to defaults
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { resetUserSettings } from "@/lib/features/settings/operations";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/user/settings/reset";

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );

      const settings = await withSpan(
        { layer: "content", name: "settings_reset" },
        undefined,
        async () => resetUserSettings(session.user.id),
      );

      return NextResponse.json({
        success: true,
        data: settings,
        message: "Settings reset to defaults",
      });
    } catch (error) {
      if (error instanceof Error && error.message === "Unauthorized") {
        return NextResponse.json(
          { success: false, error: "Unauthorized" },
          { status: 401 }
        );
      }

      logger.error({
        layer: "content",
        event: "settings_reset:caught",
        summary: "reset failed — 500",
        error,
      });
      return NextResponse.json(
        {
          success: false,
          error: "Failed to reset settings",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 }
      );
    }
  });
}
