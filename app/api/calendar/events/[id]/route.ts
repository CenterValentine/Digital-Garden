import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { deleteCalendarEvent, updateCalendarEvent } from "@/lib/domain/calendar/service";
import type { CalendarEventMutationInput } from "@/lib/domain/calendar/types";

type Params = Promise<{ id: string }>;

export async function PATCH(request: NextRequest, { params }: { params: Params }) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = (await request.json()) as Partial<CalendarEventMutationInput>;
    const data = await updateCalendarEvent(session.user.id, id, body);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Calendar Event] PATCH Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to update event" },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Params }) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    await deleteCalendarEvent(session.user.id, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Calendar Event] DELETE Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to delete event" },
      { status: 500 }
    );
  }
}
