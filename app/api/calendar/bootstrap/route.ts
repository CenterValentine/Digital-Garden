import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { getCalendarWorkspaceData } from "@/lib/domain/calendar/service";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    const { searchParams } = new URL(request.url);
    const startParam = searchParams.get("start");
    const endParam = searchParams.get("end");
    const start = startParam ? new Date(startParam) : new Date();
    const end = endParam ? new Date(endParam) : new Date(start.getTime() + 35 * 24 * 60 * 60 * 1000);

    const data = await getCalendarWorkspaceData(session.user.id, start, end);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Calendar Bootstrap] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to load calendar" },
      { status: 500 }
    );
  }
}
