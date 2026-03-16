import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { prisma } from "@/lib/database/client";
import { refreshIcalConnection, syncGoogleConnection } from "@/lib/domain/calendar/service";

type Params = Promise<{ id: string }>;

export async function POST(_request: NextRequest, { params }: { params: Params }) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const connection = await prisma.calendarConnection.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!connection) {
      return NextResponse.json({ success: false, error: "Connection not found" }, { status: 404 });
    }

    const data =
      connection.provider === "google"
        ? await syncGoogleConnection(session.user.id, id)
        : connection.provider === "ical"
          ? await refreshIcalConnection(session.user.id, id)
          : connection;

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Calendar Connection Sync] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to sync connection" },
      { status: 500 }
    );
  }
}
