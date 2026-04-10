import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { parseCalendarQuickAdd } from "./quick-add";
import {
  createCalendarEvent,
  createCalendarSource,
  createIcalConnection,
  deleteCalendarEvent,
  ensureDefaultLocalCalendar,
  ensureGoogleConnection,
  getCalendarWorkspaceData,
  listCalendarConnections,
  refreshIcalConnection,
  syncGoogleConnection,
  updateCalendarEvent,
  updateCalendarSource,
} from "./service";
import type {
  CalendarEventMutationInput,
  CalendarSourceMutationInput,
} from "./types";

type Params = Promise<{ id: string }>;

export async function getCalendarEventsRoute(request: NextRequest) {
  try {
    const session = await requireAuth();
    const { searchParams } = new URL(request.url);
    const start = new Date(searchParams.get("start") || new Date().toISOString());
    const end = new Date(
      searchParams.get("end") ||
        new Date(Date.now() + 35 * 24 * 60 * 60 * 1000).toISOString()
    );
    const data = await getCalendarWorkspaceData(session.user.id, start, end);
    return NextResponse.json({ success: true, data: data.events });
  } catch (error) {
    console.error("[Calendar Events] GET Error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to fetch events",
      },
      { status: 500 }
    );
  }
}

export async function createCalendarEventRoute(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = (await request.json()) as CalendarEventMutationInput;
    const data = await createCalendarEvent(session.user.id, body);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Calendar Events] POST Error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to create event",
      },
      { status: 500 }
    );
  }
}

export async function updateCalendarEventRoute(
  request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = (await request.json()) as Partial<CalendarEventMutationInput>;
    const data = await updateCalendarEvent(session.user.id, id, body);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Calendar Event] PATCH Error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to update event",
      },
      { status: 500 }
    );
  }
}

export async function deleteCalendarEventRoute(
  _request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    await deleteCalendarEvent(session.user.id, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Calendar Event] DELETE Error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to delete event",
      },
      { status: 500 }
    );
  }
}

export async function getCalendarBootstrapRoute(request: NextRequest) {
  try {
    const session = await requireAuth();
    const { searchParams } = new URL(request.url);
    const startParam = searchParams.get("start");
    const endParam = searchParams.get("end");
    const start = startParam ? new Date(startParam) : new Date();
    const end = endParam
      ? new Date(endParam)
      : new Date(start.getTime() + 35 * 24 * 60 * 60 * 1000);

    const data = await getCalendarWorkspaceData(session.user.id, start, end);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Calendar Bootstrap] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to load calendar",
      },
      { status: 500 }
    );
  }
}

export async function createCalendarQuickAddRoute(request: NextRequest) {
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
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to parse draft",
      },
      { status: 500 }
    );
  }
}

export async function listCalendarConnectionsRoute() {
  try {
    const session = await requireAuth();
    const data = await listCalendarConnections(session.user.id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Calendar Connections] GET Error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to fetch connections",
      },
      { status: 500 }
    );
  }
}

export async function createCalendarConnectionRoute(request: NextRequest) {
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
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to create connection",
      },
      { status: 500 }
    );
  }
}

export async function deleteCalendarConnectionRoute(
  _request: NextRequest,
  { params }: { params: Params }
) {
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
      return NextResponse.json(
        { success: false, error: "Connection not found" },
        { status: 404 }
      );
    }

    await prisma.calendarConnection.delete({
      where: { id: connection.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Calendar Connection] DELETE Error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to delete connection",
      },
      { status: 500 }
    );
  }
}

export async function syncCalendarConnectionRoute(
  _request: NextRequest,
  { params }: { params: Params }
) {
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
      return NextResponse.json(
        { success: false, error: "Connection not found" },
        { status: 404 }
      );
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
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to sync connection",
      },
      { status: 500 }
    );
  }
}

export async function createCalendarSourceRoute(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = (await request.json()) as CalendarSourceMutationInput;
    const data = await createCalendarSource(session.user.id, body);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Calendar Sources] POST Error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to create calendar",
      },
      { status: 500 }
    );
  }
}

export async function updateCalendarSourceRoute(
  request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = (await request.json()) as Partial<
      CalendarSourceMutationInput
    > & { visible?: boolean };
    const data = await updateCalendarSource(session.user.id, id, body);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Calendar Source] PATCH Error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to update calendar",
      },
      { status: 500 }
    );
  }
}

export async function deleteCalendarSourceRoute(
  _request: NextRequest,
  { params }: { params: Params }
) {
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
      return NextResponse.json(
        { success: false, error: "Calendar source not found" },
        { status: 404 }
      );
    }

    await prisma.calendarSource.delete({
      where: { id: source.id },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Calendar Source] DELETE Error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to delete calendar",
      },
      { status: 500 }
    );
  }
}
