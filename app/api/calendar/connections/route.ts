import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import {
  createIcalConnection,
  ensureGoogleConnection,
  listCalendarConnections,
} from "@/lib/domain/calendar/service";

export async function GET() {
  try {
    const session = await requireAuth();
    const data = await listCalendarConnections(session.user.id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Calendar Connections] GET Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to fetch connections" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = (await request.json()) as {
      provider: "google" | "ical";
      displayName?: string;
      url?: string;
    };

    if (body.provider === "google") {
      const data = await ensureGoogleConnection(session.user.id);
      return NextResponse.json({ success: true, data });
    }

    if (body.provider === "ical" && body.url) {
      const data = await createIcalConnection(
        session.user.id,
        body.displayName || "Subscribed calendar",
        body.url
      );
      return NextResponse.json({ success: true, data });
    }

    return NextResponse.json(
      { success: false, error: "Unsupported connection request" },
      { status: 400 }
    );
  } catch (error) {
    console.error("[Calendar Connections] POST Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to create connection" },
      { status: 500 }
    );
  }
}
