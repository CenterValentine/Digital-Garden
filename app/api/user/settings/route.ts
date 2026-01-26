/**
 * User Settings API
 *
 * GET   /api/user/settings - Fetch current user's settings
 * PATCH /api/user/settings - Update user settings (partial)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/middleware";
import {
  getUserSettings,
  updateUserSettings,
} from "@/lib/settings/utils";
import { userSettingsSchema } from "@/lib/settings/validation";

/**
 * GET /api/user/settings
 * Fetch current user's settings
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();

    const settings = await getUserSettings(session.user.id);

    return NextResponse.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error("[Settings API] GET error:", error);

    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch settings",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/user/settings
 * Update user settings (partial update)
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await requireAuth();

    const body = await request.json();

    // Validate partial settings
    const validated = userSettingsSchema.partial().parse(body);

    // Update (merges with existing settings)
    const updated = await updateUserSettings(session.user.id, validated);

    return NextResponse.json({
      success: true,
      data: updated,
      message: "Settings updated successfully",
    });
  } catch (error) {
    console.error("[Settings API] PATCH error:", error);

    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Zod validation errors
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

    return NextResponse.json(
      {
        success: false,
        error: "Failed to update settings",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
