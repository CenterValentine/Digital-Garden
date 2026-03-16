import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { parseCalendarQuickAdd } from "@/lib/domain/calendar/quick-add";
import { ensureDefaultLocalCalendar } from "@/lib/domain/calendar/service";

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = (await request.json()) as {
      text?: string | null;
      linkedContentId?: string | null;
      sourceId?: string | null;
      timezone?: string | null;
    };
    const defaultLocal = await ensureDefaultLocalCalendar(session.user.id);
    const data = parseCalendarQuickAdd({
      ...body,
      sourceId: body.sourceId || defaultLocal.source.id,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Calendar Quick Add] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to parse draft" },
      { status: 500 }
    );
  }
}
