/**
 * User Settings API
 *
 * GET   /api/user/settings - Fetch current user's settings
 * PATCH /api/user/settings - Update user settings (partial)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import {
  getUserSettings,
  updateUserSettings,
} from "@/lib/features/settings/operations";
import { userSettingsSchema } from "@/lib/features/settings/validation";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/user/settings";

export async function GET(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );

      const settings = await withSpan(
        { layer: "content", name: "settings_read" },
        undefined,
        async () => getUserSettings(session.user.id),
      );

      return NextResponse.json({
        success: true,
        data: settings,
      });
    } catch (error) {
      const isAuthError =
        error instanceof Error &&
        (error.message === "Unauthorized" ||
          error.message === "Authentication required" ||
          error.message.toLowerCase().includes("auth"));

      if (isAuthError) {
        return NextResponse.json(
          { success: false, error: "Unauthorized" },
          { status: 401 }
        );
      }

      logger.error({
        layer: "content",
        event: "settings_read:caught",
        summary: "GET caught — translated to 500",
        error,
      });
      return NextResponse.json(
        {
          success: false,
          error: "Failed to fetch settings",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 }
      );
    }
  });
}

export async function PATCH(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );

      const body = await request.json();

      const validated = userSettingsSchema.partial().parse(body);

      const updated = await withSpan(
        { layer: "content", name: "settings_update" },
        undefined,
        async () => updateUserSettings(session.user.id, validated),
      );

      return NextResponse.json({
        success: true,
        data: updated,
        message: "Settings updated successfully",
      });
    } catch (error) {
      if (error instanceof Error && error.message === "Unauthorized") {
        return NextResponse.json(
          { success: false, error: "Unauthorized" },
          { status: 401 }
        );
      }

      if (error instanceof Error && error.name === "ZodError") {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid settings data",
            details: error.message,
          },
          { status: 400 }
        );
      }

      logger.error({
        layer: "content",
        event: "settings_update:caught",
        summary: "PATCH caught — translated to 500",
        error,
      });
      return NextResponse.json(
        {
          success: false,
          error: "Failed to update settings",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 }
      );
    }
  });
}
