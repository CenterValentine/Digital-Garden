import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { createCalendarEvent, getCalendarWorkspaceData } from "@/lib/domain/calendar/service";
import type { CalendarEventMutationInput } from "@/lib/domain/calendar/types";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    const { searchParams } = new URL(request.url);
    const start = new Date(searchParams.get("start") || new Date().toISOString());
    const end = new Date(
      searchParams.get("end") || new Date(Date.now() + 35 * 24 * 60 * 60 * 1000).toISOString()
    );
    const data = await getCalendarWorkspaceData(session.user.id, start, end);
    return NextResponse.json({ success: true, data: data.events });
  } catch (error) {
    console.error("[Calendar Events] GET Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to fetch events" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = (await request.json()) as CalendarEventMutationInput;
    const data = await createCalendarEvent(session.user.id, body);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Calendar Events] POST Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to create event" },
      { status: 500 }
    );
  }
}
