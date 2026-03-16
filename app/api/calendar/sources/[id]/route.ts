import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { prisma } from "@/lib/database/client";
import { updateCalendarSource } from "@/lib/domain/calendar/service";
import type { CalendarSourceMutationInput } from "@/lib/domain/calendar/types";

type Params = Promise<{ id: string }>;

export async function PATCH(request: NextRequest, { params }: { params: Params }) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = (await request.json()) as Partial<CalendarSourceMutationInput> & { visible?: boolean };
    const data = await updateCalendarSource(session.user.id, id, body);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Calendar Source] PATCH Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to update calendar" },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Params }) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const source = await prisma.calendarSource.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!source) {
      return NextResponse.json({ success: false, error: "Calendar source not found" }, { status: 404 });
    }

    await prisma.calendarSource.delete({
      where: { id: source.id },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Calendar Source] DELETE Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to delete calendar" },
      { status: 500 }
    );
  }
}
