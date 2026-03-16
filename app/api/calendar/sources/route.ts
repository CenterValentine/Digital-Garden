import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { createCalendarSource } from "@/lib/domain/calendar/service";
import type { CalendarSourceMutationInput } from "@/lib/domain/calendar/types";

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = (await request.json()) as CalendarSourceMutationInput;
    const data = await createCalendarSource(session.user.id, body);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Calendar Sources] POST Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to create calendar" },
      { status: 500 }
    );
  }
}
