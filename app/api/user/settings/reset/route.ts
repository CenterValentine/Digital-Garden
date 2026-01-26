/**
 * User Settings Reset API
 *
 * POST /api/user/settings/reset - Reset settings to defaults
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { resetUserSettings } from "@/lib/features/settings/utils";

/**
 * POST /api/user/settings/reset
 * Reset settings to defaults
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();

    const settings = await resetUserSettings(session.user.id);

    return NextResponse.json({
      success: true,
      data: settings,
      message: "Settings reset to defaults",
    });
  } catch (error) {
    console.error("[Settings API] Reset error:", error);

    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to reset settings",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
