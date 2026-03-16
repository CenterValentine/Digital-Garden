import { prisma } from "@/lib/database/client";
import {
  getGoogleAccount,
  getValidGoogleAccessToken,
  hasGoogleScope,
} from "@/lib/infrastructure/auth";
import type { Prisma } from "@/lib/database/generated/prisma";
import { GOOGLE_CALENDAR_SCOPE } from "./types";
import type {
  CalendarConnectionDTO,
  CalendarEventDTO,
  CalendarEventMutationInput,
  CalendarEventWithRelations,
  CalendarSourceDTO,
  CalendarSourceMutationInput,
  CalendarWorkspaceResponse,
} from "./types";

const DEFAULT_LOCAL_SOURCE_COLOR = "#2563EB";
const GOOGLE_API_BASE = "https://www.googleapis.com/calendar/v3";

type CalendarConnectionModel = Prisma.CalendarConnectionGetPayload<Record<string, never>>;
type CalendarSourceWithConnection = Prisma.CalendarSourceGetPayload<{
  include: {
    connection: true;
  };
}>;

function toIsoOrNull(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function toInputJson(value: Record<string, unknown> | string[] | null | undefined): Prisma.InputJsonValue {
  return (value ?? {}) as Prisma.InputJsonValue;
}

function readIcalText(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (
    value &&
    typeof value === "object" &&
    "val" in value &&
    typeof (value as { val?: unknown }).val === "string"
  ) {
    return (value as { val: string }).val;
  }

  return null;
}

function serializeConnection(connection: CalendarConnectionModel): CalendarConnectionDTO {
  return {
    ...connection,
    providerConfig: (connection.providerConfig as Record<string, unknown>) ?? {},
    syncCursor: connection.syncCursor,
    lastSyncedAt: toIsoOrNull(connection.lastSyncedAt),
    createdAt: connection.createdAt.toISOString(),
    updatedAt: connection.updatedAt.toISOString(),
  };
}

function serializeSource(source: CalendarSourceWithConnection): CalendarSourceDTO {
  return {
    id: source.id,
    connectionId: source.connectionId,
    provider: source.connection?.provider ?? "local",
    title: source.title,
    color: source.color,
    timezone: source.timezone,
    visible: source.visible,
    isReadOnly: source.isReadOnly,
    isPrimary: source.isPrimary,
    syncMode: source.syncMode,
    externalCalendarId: source.externalCalendarId,
    metadata: (source.metadata as Record<string, unknown>) ?? {},
    lastSyncedAt: toIsoOrNull(source.lastSyncedAt),
    lastSyncError: source.lastSyncError,
  };
}

export function serializeEvent(event: CalendarEventWithRelations): CalendarEventDTO {
  return {
    id: event.id,
    sourceId: event.sourceId,
    externalEventId: event.externalEventId,
    title: event.title,
    description: event.description,
    location: event.location,
    startAt: event.startAt.toISOString(),
    endAt: event.endAt.toISOString(),
    allDay: event.allDay,
    timezone: event.timezone,
    recurrenceRule: event.recurrenceRule,
    recurrenceExDates: ((event.recurrenceExDates as string[]) ?? []).map((date) => new Date(date).toISOString()),
    recurrenceOverrides: (event.recurrenceOverrides as Record<string, unknown>) ?? {},
    status: event.status,
    meetingUrl: event.meetingUrl,
    linkedContentId: event.linkedContentId,
    linkedNote: event.linkedContent
      ? {
          id: event.linkedContent.id,
          title: event.linkedContent.title,
          slug: event.linkedContent.slug,
        }
      : null,
    providerMetadata: (event.providerMetadata as Record<string, unknown>) ?? {},
    lastSyncedAt: toIsoOrNull(event.lastSyncedAt),
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
    source: {
      id: event.source.id,
      provider: event.source.connection?.provider ?? "local",
      title: event.source.title,
      color: event.source.color,
      isReadOnly: event.source.isReadOnly,
    },
    attendees: event.attendees.map((attendee) => ({
      id: attendee.id,
      email: attendee.email,
      displayName: attendee.displayName,
      isOrganizer: attendee.isOrganizer,
      responseStatus: attendee.responseStatus,
    })),
  };
}

async function getOrCreateLocalConnection(userId: string) {
  let connection = await prisma.calendarConnection.findFirst({
    where: {
      userId,
      provider: "local",
    },
  });

  if (!connection) {
    connection = await prisma.calendarConnection.create({
      data: {
        userId,
        provider: "local",
        displayName: "Local calendars",
      },
    });
  }

  return connection;
}

export async function ensureDefaultLocalCalendar(userId: string) {
  const connection = await getOrCreateLocalConnection(userId);
  let source = await prisma.calendarSource.findFirst({
    where: {
      userId,
      connectionId: connection.id,
      syncMode: "local",
    },
  });

  if (!source) {
    source = await prisma.calendarSource.create({
      data: {
        userId,
        connectionId: connection.id,
        title: "Personal",
        color: DEFAULT_LOCAL_SOURCE_COLOR,
        visible: true,
        isReadOnly: false,
        isPrimary: true,
        syncMode: "local",
      },
    });
  }

  return { connection, source };
}

async function ensureGoogleCalendarConnection(userId: string) {
  const account = await getGoogleAccount(userId);

  if (!account) {
    return null;
  }

  const hasCalendarAccess = hasGoogleScope(account.scope, GOOGLE_CALENDAR_SCOPE);
  const status = hasCalendarAccess ? "active" : "reconnect_required";
  const existingConnection = await prisma.calendarConnection.findFirst({
    where: {
      userId,
      provider: "google",
    },
  });

  if (existingConnection) {
    return prisma.calendarConnection.update({
      where: {
        id: existingConnection.id,
      },
      data: {
        displayName: "Google Calendar",
        status,
        lastSyncError: hasCalendarAccess
          ? null
          : "Google Calendar scope is missing. Reconnect Google to enable calendar sync.",
      },
    });
  }

  return prisma.calendarConnection.create({
    data: {
      userId,
      provider: "google",
      displayName: "Google Calendar",
      status,
      lastSyncError: hasCalendarAccess
        ? null
        : "Google Calendar scope is missing. Reconnect Google to enable calendar sync.",
    },
  });
}

async function ensureGoogleCalendarsLoaded(userId: string) {
  const connection = await ensureGoogleCalendarConnection(userId);

  if (!connection || connection.status !== "active") {
    return connection;
  }

  const googleSourceCount = await prisma.calendarSource.count({
    where: {
      userId,
      connectionId: connection.id,
      connection: {
        provider: "google",
      },
    },
  });

  if (googleSourceCount === 0) {
    return syncGoogleConnection(userId, connection.id);
  }

  return connection;
}

export async function getCalendarWorkspaceData(
  userId: string,
  start: Date,
  end: Date
): Promise<CalendarWorkspaceResponse> {
  await Promise.all([
    ensureDefaultLocalCalendar(userId),
    ensureGoogleCalendarsLoaded(userId),
  ]);

  const [connections, sources, events, upcoming] = await Promise.all([
    prisma.calendarConnection.findMany({
      where: { userId },
      orderBy: [{ provider: "asc" }, { createdAt: "asc" }],
    }),
    prisma.calendarSource.findMany({
      where: { userId },
      include: { connection: true },
      orderBy: [{ isPrimary: "desc" }, { title: "asc" }],
    }),
    prisma.calendarEvent.findMany({
      where: {
        userId,
        startAt: { lt: end },
        endAt: { gt: start },
        source: { visible: true },
      },
      include: {
        attendees: true,
        linkedContent: { select: { id: true, title: true, slug: true } },
        source: { include: { connection: true } },
      },
      orderBy: [{ startAt: "asc" }],
    }),
    prisma.calendarEvent.findMany({
      where: {
        userId,
        endAt: { gte: new Date() },
        source: { visible: true },
      },
      include: {
        attendees: true,
        linkedContent: { select: { id: true, title: true, slug: true } },
        source: { include: { connection: true } },
      },
      orderBy: [{ startAt: "asc" }],
      take: 10,
    }),
  ]);

  return {
    range: {
      start: start.toISOString(),
      end: end.toISOString(),
    },
    connections: connections.map((connection) => serializeConnection(connection)),
    sources: sources.map((source) => serializeSource(source)),
    events: events.map((event) => serializeEvent(event)),
    upcoming: upcoming.map((event) => serializeEvent(event)),
  };
}

async function fetchGoogleJson<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${GOOGLE_API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
  });

  if (response.status === 401 || response.status === 403) {
    const body = await response.text();
    throw new Error(body || "Google Calendar authorization failed");
  }

  if (!response.ok) {
    throw new Error(`Google Calendar request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function upsertGoogleCalendars(userId: string, connectionId: string, accessToken: string) {
  const payload = await fetchGoogleJson<{
    items?: Array<{
      id: string;
      summary?: string;
      primary?: boolean;
      accessRole?: string;
      backgroundColor?: string;
      timeZone?: string;
    }>;
  }>(accessToken, "/users/me/calendarList");

  const items = payload.items ?? [];
  for (const item of items) {
    await prisma.calendarSource.upsert({
      where: {
        userId_externalCalendarId: {
          userId,
          externalCalendarId: item.id,
        },
      },
      update: {
        connectionId,
        title: item.summary || "Google Calendar",
        color: item.backgroundColor || "#0F9D58",
        timezone: item.timeZone || null,
        visible: true,
        isReadOnly: item.accessRole === "reader",
        isPrimary: Boolean(item.primary),
        syncMode: "imported",
        metadata: {
          accessRole: item.accessRole,
          source: "google",
        },
        lastSyncedAt: new Date(),
        lastSyncError: null,
      },
      create: {
        userId,
        connectionId,
        title: item.summary || "Google Calendar",
        color: item.backgroundColor || "#0F9D58",
        timezone: item.timeZone || null,
        visible: true,
        isReadOnly: item.accessRole === "reader",
        isPrimary: Boolean(item.primary),
        syncMode: "imported",
        externalCalendarId: item.id,
        metadata: {
          accessRole: item.accessRole,
          source: "google",
        },
        lastSyncedAt: new Date(),
      },
    });
  }
}

function googleEventDate(value: { date?: string; dateTime?: string; timeZone?: string } | undefined) {
  if (!value) return null;
  if (value.dateTime) return new Date(value.dateTime);
  if (value.date) return new Date(`${value.date}T00:00:00.000Z`);
  return null;
}

async function syncGoogleEventsForSource(
  userId: string,
  source: { id: string; externalCalendarId: string | null },
  accessToken: string,
  start: Date,
  end: Date
) {
  if (!source.externalCalendarId) {
    return;
  }

  const params = new URLSearchParams({
    singleEvents: "true",
    showDeleted: "true",
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
  });

  const payload = await fetchGoogleJson<{
    items?: Array<{
      id: string;
      summary?: string;
      description?: string;
      location?: string;
      status?: "confirmed" | "tentative" | "cancelled";
      start?: { date?: string; dateTime?: string; timeZone?: string };
      end?: { date?: string; dateTime?: string; timeZone?: string };
      recurrence?: string[];
      attendees?: Array<{
        email?: string;
        displayName?: string;
        organizer?: boolean;
        responseStatus?: "needsAction" | "accepted" | "tentative" | "declined";
      }>;
      conferenceData?: {
        entryPoints?: Array<{ uri?: string }>;
      };
      htmlLink?: string;
    }>;
  }>(accessToken, `/calendars/${encodeURIComponent(source.externalCalendarId)}/events?${params.toString()}`);

  for (const item of payload.items ?? []) {
    const startAt = googleEventDate(item.start);
    const endAt = googleEventDate(item.end);
    if (!startAt || !endAt || !item.id) {
      continue;
    }

    const event = await prisma.calendarEvent.upsert({
      where: {
        sourceId_externalEventId: {
          sourceId: source.id,
          externalEventId: item.id,
        },
      },
      update: {
        title: item.summary || "Untitled event",
        description: item.description || null,
        location: item.location || null,
        startAt,
        endAt,
        allDay: Boolean(item.start?.date && !item.start?.dateTime),
        timezone: item.start?.timeZone || item.end?.timeZone || null,
        recurrenceRule: item.recurrence?.[0] || null,
        status: item.status || "confirmed",
        meetingUrl:
          item.conferenceData?.entryPoints?.find((entry) => entry.uri)?.uri ||
          item.htmlLink ||
          null,
        providerMetadata: {
          raw: item,
        },
        lastSyncedAt: new Date(),
      },
      create: {
        userId,
        sourceId: source.id,
        externalEventId: item.id,
        title: item.summary || "Untitled event",
        description: item.description || null,
        location: item.location || null,
        startAt,
        endAt,
        allDay: Boolean(item.start?.date && !item.start?.dateTime),
        timezone: item.start?.timeZone || item.end?.timeZone || null,
        recurrenceRule: item.recurrence?.[0] || null,
        status: item.status || "confirmed",
        meetingUrl:
          item.conferenceData?.entryPoints?.find((entry) => entry.uri)?.uri ||
          item.htmlLink ||
          null,
        providerMetadata: {
          raw: item,
        },
        lastSyncedAt: new Date(),
      },
    });

    await prisma.calendarEventAttendee.deleteMany({
      where: { eventId: event.id },
    });

    if (item.attendees?.length) {
      await prisma.calendarEventAttendee.createMany({
        data: item.attendees
          .filter((attendee) => attendee.email)
          .map((attendee) => ({
            eventId: event.id,
            email: attendee.email!,
            displayName: attendee.displayName || null,
            isOrganizer: Boolean(attendee.organizer),
            responseStatus:
              attendee.responseStatus === "needsAction"
                ? "needs_action"
                : attendee.responseStatus || "needs_action",
          })),
      });
    }
  }
}

export async function syncGoogleConnection(userId: string, connectionId: string) {
  const connection = await prisma.calendarConnection.findFirst({
    where: {
      id: connectionId,
      userId,
      provider: "google",
    },
  });

  if (!connection) {
    throw new Error("Google calendar connection not found");
  }

  await prisma.calendarConnection.update({
    where: { id: connection.id },
    data: { syncStatus: "syncing", lastSyncError: null },
  });

  try {
    const accessToken = await getValidGoogleAccessToken(userId);
    await upsertGoogleCalendars(userId, connection.id, accessToken);

    const sources = await prisma.calendarSource.findMany({
      where: {
        userId,
        connectionId: connection.id,
      },
      select: {
        id: true,
        externalCalendarId: true,
      },
    });

    const start = new Date();
    start.setMonth(start.getMonth() - 6);
    const end = new Date();
    end.setMonth(end.getMonth() + 12);

    for (const source of sources) {
      await syncGoogleEventsForSource(userId, source, accessToken, start, end);
    }

    const updated = await prisma.calendarConnection.update({
      where: { id: connection.id },
      data: {
        status: "active",
        syncStatus: "success",
        syncCursor: new Date().toISOString(),
        lastSyncedAt: new Date(),
        lastSyncError: null,
      },
    });

    return serializeConnection(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google sync failed";
    const updated = await prisma.calendarConnection.update({
      where: { id: connection.id },
      data: {
        status: message.includes("403") ? "reconnect_required" : "error",
        syncStatus: "error",
        lastSyncError: message,
      },
    });
    return serializeConnection(updated);
  }
}

export async function refreshIcalConnection(userId: string, connectionId: string) {
  const connection = await prisma.calendarConnection.findFirst({
    where: {
      id: connectionId,
      userId,
      provider: "ical",
    },
    include: {
      sources: true,
    },
  });

  if (!connection) {
    throw new Error("iCal connection not found");
  }

  const url = String((connection.providerConfig as Record<string, unknown>)?.url || "");
  if (!url) {
    throw new Error("iCal connection is missing a feed URL");
  }

  await prisma.calendarConnection.update({
    where: { id: connection.id },
    data: {
      syncStatus: "syncing",
      lastSyncError: null,
    },
  });

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch iCal feed (${response.status})`);
    }

    const feedText = await response.text();
    const icalModule = await import("node-ical");
    const parsed = icalModule.default.sync.parseICS(feedText);
    const existingSource =
      connection.sources[0] ||
      (await prisma.calendarSource.create({
        data: {
          userId,
          connectionId: connection.id,
          title: connection.displayName,
          color: "#F97316",
          visible: true,
          isReadOnly: true,
          isPrimary: false,
          syncMode: "subscription",
          metadata: {
            url,
          },
        },
      }));

    for (const entry of Object.values(parsed)) {
      if (!entry || entry.type !== "VEVENT" || !entry.uid || !entry.start || !entry.end) {
        continue;
      }

      await prisma.calendarEvent.upsert({
        where: {
          sourceId_externalEventId: {
            sourceId: existingSource.id,
            externalEventId: entry.uid,
          },
        },
        update: {
          title: readIcalText(entry.summary) || "Untitled event",
          description: readIcalText(entry.description),
          location: readIcalText(entry.location),
          startAt: new Date(entry.start),
          endAt: new Date(entry.end),
          allDay: Boolean(entry.datetype === "date"),
          timezone: (entry as { tz?: string }).tz || null,
          recurrenceRule: entry.rrule?.toString() || null,
          status:
            entry.status?.toLowerCase() === "cancelled"
              ? "cancelled"
              : "confirmed",
          providerMetadata: {
            url,
          },
          lastSyncedAt: new Date(),
        },
        create: {
          userId,
          sourceId: existingSource.id,
          externalEventId: entry.uid,
          title: readIcalText(entry.summary) || "Untitled event",
          description: readIcalText(entry.description),
          location: readIcalText(entry.location),
          startAt: new Date(entry.start),
          endAt: new Date(entry.end),
          allDay: Boolean(entry.datetype === "date"),
          timezone: (entry as { tz?: string }).tz || null,
          recurrenceRule: entry.rrule?.toString() || null,
          status:
            entry.status?.toLowerCase() === "cancelled"
              ? "cancelled"
              : "confirmed",
          providerMetadata: {
            url,
          },
          lastSyncedAt: new Date(),
        },
      });
    }

    const updated = await prisma.calendarConnection.update({
      where: { id: connection.id },
      data: {
        status: "active",
        syncStatus: "success",
        syncCursor: new Date().toISOString(),
        lastSyncedAt: new Date(),
        lastSyncError: null,
      },
    });

    await prisma.calendarSource.update({
      where: { id: existingSource.id },
      data: {
        lastSyncedAt: new Date(),
        lastSyncError: null,
      },
    });

    return serializeConnection(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "iCal refresh failed";
    const updated = await prisma.calendarConnection.update({
      where: { id: connection.id },
      data: {
        status: "error",
        syncStatus: "error",
        lastSyncError: message,
      },
    });
    return serializeConnection(updated);
  }
}

async function syncGoogleEventToProvider(
  userId: string,
  source: { externalCalendarId: string | null },
  input: CalendarEventMutationInput,
  externalEventId?: string
) {
  if (!source.externalCalendarId) {
    throw new Error("Google source is missing an external calendar ID");
  }

  const accessToken = await getValidGoogleAccessToken(userId);
  const body = {
    summary: input.title,
    description: input.description || undefined,
    location: input.location || undefined,
    start: input.allDay
      ? { date: input.startAt.slice(0, 10) }
      : { dateTime: input.startAt, timeZone: input.timezone || undefined },
    end: input.allDay
      ? { date: input.endAt.slice(0, 10) }
      : { dateTime: input.endAt, timeZone: input.timezone || undefined },
    recurrence: input.recurrenceRule ? [input.recurrenceRule] : undefined,
    attendees: input.attendees?.map((attendee) => ({
      email: attendee.email,
      displayName: attendee.displayName || undefined,
      optional: !attendee.isOrganizer,
      responseStatus:
        attendee.responseStatus === "needs_action"
          ? "needsAction"
          : attendee.responseStatus,
    })),
  };

  if (externalEventId) {
    return fetchGoogleJson<{ id: string }>(
      accessToken,
      `/calendars/${encodeURIComponent(source.externalCalendarId)}/events/${encodeURIComponent(externalEventId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(body),
      }
    );
  }

  return fetchGoogleJson<{ id: string }>(
    accessToken,
    `/calendars/${encodeURIComponent(source.externalCalendarId)}/events`,
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  );
}

async function replaceAttendees(eventId: string, attendees: CalendarEventMutationInput["attendees"]) {
  await prisma.calendarEventAttendee.deleteMany({ where: { eventId } });

  if (!attendees?.length) {
    return;
  }

  await prisma.calendarEventAttendee.createMany({
    data: attendees.map((attendee) => ({
      eventId,
      email: attendee.email,
      displayName: attendee.displayName || null,
      isOrganizer: Boolean(attendee.isOrganizer),
      responseStatus: attendee.responseStatus || "needs_action",
    })),
  });
}

export async function createCalendarEvent(userId: string, input: CalendarEventMutationInput) {
  const source = await prisma.calendarSource.findFirst({
    where: {
      id: input.sourceId,
      userId,
    },
    include: {
      connection: true,
    },
  });

  if (!source) {
    throw new Error("Calendar source not found");
  }

  if (source.isReadOnly) {
    throw new Error("This calendar is read-only");
  }

  let externalEventId: string | null = null;
  if (source.connection?.provider === "google") {
    const providerEvent = await syncGoogleEventToProvider(userId, source, input);
    externalEventId = providerEvent.id;
  }

  const event = await prisma.calendarEvent.create({
    data: {
      userId,
      sourceId: source.id,
      externalEventId,
      title: input.title,
      description: input.description || null,
      location: input.location || null,
      startAt: new Date(input.startAt),
      endAt: new Date(input.endAt),
      allDay: Boolean(input.allDay),
      timezone: input.timezone || null,
      recurrenceRule: input.recurrenceRule || null,
      recurrenceExDates: input.recurrenceExDates || [],
      recurrenceOverrides: toInputJson(input.recurrenceOverrides),
      status: input.status || "confirmed",
      meetingUrl: input.meetingUrl || null,
      linkedContentId: input.linkedContentId || null,
    },
    include: {
      attendees: true,
      linkedContent: { select: { id: true, title: true, slug: true } },
      source: { include: { connection: true } },
    },
  });

  await replaceAttendees(event.id, input.attendees);

  const refreshed = await prisma.calendarEvent.findUniqueOrThrow({
    where: { id: event.id },
    include: {
      attendees: true,
      linkedContent: { select: { id: true, title: true, slug: true } },
      source: { include: { connection: true } },
    },
  });

  return serializeEvent(refreshed);
}

export async function updateCalendarEvent(userId: string, eventId: string, input: Partial<CalendarEventMutationInput>) {
  const existing = await prisma.calendarEvent.findFirst({
    where: {
      id: eventId,
      userId,
    },
    include: {
      source: {
        include: {
          connection: true,
        },
      },
    },
  });

  if (!existing) {
    throw new Error("Calendar event not found");
  }

  if (existing.source.isReadOnly) {
    throw new Error("This calendar is read-only");
  }

  const nextPayload: CalendarEventMutationInput = {
    sourceId: existing.sourceId,
    title: input.title ?? existing.title,
    description: input.description ?? existing.description,
    location: input.location ?? existing.location,
    startAt: (input.startAt ?? existing.startAt.toISOString()),
    endAt: (input.endAt ?? existing.endAt.toISOString()),
    allDay: input.allDay ?? existing.allDay,
    timezone: input.timezone ?? existing.timezone,
    recurrenceRule: input.recurrenceRule ?? existing.recurrenceRule,
    recurrenceExDates:
      input.recurrenceExDates ?? ((existing.recurrenceExDates as string[]) ?? []),
    recurrenceOverrides:
      input.recurrenceOverrides ?? ((existing.recurrenceOverrides as Record<string, unknown>) ?? {}),
    status: input.status ?? existing.status,
    meetingUrl: input.meetingUrl ?? existing.meetingUrl,
    linkedContentId: input.linkedContentId ?? existing.linkedContentId,
    attendees: input.attendees,
  };

  if (existing.source.connection?.provider === "google" && existing.externalEventId) {
    await syncGoogleEventToProvider(userId, existing.source, nextPayload, existing.externalEventId);
  }

  await prisma.calendarEvent.update({
    where: { id: existing.id },
    data: {
      title: nextPayload.title,
      description: nextPayload.description || null,
      location: nextPayload.location || null,
      startAt: new Date(nextPayload.startAt),
      endAt: new Date(nextPayload.endAt),
      allDay: Boolean(nextPayload.allDay),
      timezone: nextPayload.timezone || null,
      recurrenceRule: nextPayload.recurrenceRule || null,
      recurrenceExDates: nextPayload.recurrenceExDates || [],
      recurrenceOverrides: toInputJson(nextPayload.recurrenceOverrides),
      status: nextPayload.status || "confirmed",
      meetingUrl: nextPayload.meetingUrl || null,
      linkedContentId: nextPayload.linkedContentId || null,
    },
  });

  if (input.attendees !== undefined) {
    await replaceAttendees(existing.id, input.attendees);
  }

  const refreshed = await prisma.calendarEvent.findUniqueOrThrow({
    where: { id: existing.id },
    include: {
      attendees: true,
      linkedContent: { select: { id: true, title: true, slug: true } },
      source: { include: { connection: true } },
    },
  });

  return serializeEvent(refreshed);
}

export async function deleteCalendarEvent(userId: string, eventId: string) {
  const existing = await prisma.calendarEvent.findFirst({
    where: {
      id: eventId,
      userId,
    },
    include: {
      source: {
        include: {
          connection: true,
        },
      },
    },
  });

  if (!existing) {
    throw new Error("Calendar event not found");
  }

  if (existing.source.isReadOnly) {
    throw new Error("This calendar is read-only");
  }

  if (existing.source.connection?.provider === "google" && existing.externalEventId && existing.source.externalCalendarId) {
    const accessToken = await getValidGoogleAccessToken(userId);
    await fetchGoogleJson(
      accessToken,
      `/calendars/${encodeURIComponent(existing.source.externalCalendarId)}/events/${encodeURIComponent(existing.externalEventId)}`,
      {
        method: "DELETE",
      }
    ).catch(() => undefined);
  }

  await prisma.calendarEvent.delete({
    where: { id: existing.id },
  });
}

export async function listCalendarConnections(userId: string) {
  await Promise.all([
    ensureDefaultLocalCalendar(userId),
    ensureGoogleCalendarsLoaded(userId),
  ]);
  const connections = await prisma.calendarConnection.findMany({
    where: { userId },
    orderBy: [{ provider: "asc" }, { createdAt: "asc" }],
  });
  return connections.map((connection) => serializeConnection(connection));
}

export async function createCalendarSource(userId: string, input: CalendarSourceMutationInput) {
  const { connection } = await ensureDefaultLocalCalendar(userId);
  const source = await prisma.calendarSource.create({
    data: {
      userId,
      connectionId: connection.id,
      title: input.title,
      color: input.color || DEFAULT_LOCAL_SOURCE_COLOR,
      timezone: input.timezone || null,
      visible: input.visible ?? true,
      isPrimary: input.isPrimary ?? false,
      isReadOnly: false,
      syncMode: "local",
    },
    include: {
      connection: true,
    },
  });
  return serializeSource(source);
}

export async function updateCalendarSource(userId: string, sourceId: string, input: Partial<CalendarSourceMutationInput> & { visible?: boolean }) {
  const source = await prisma.calendarSource.findFirst({
    where: {
      id: sourceId,
      userId,
    },
    include: {
      connection: true,
    },
  });

  if (!source) {
    throw new Error("Calendar source not found");
  }

  const updated = await prisma.calendarSource.update({
    where: { id: source.id },
    data: {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.color !== undefined && { color: input.color }),
      ...(input.timezone !== undefined && { timezone: input.timezone }),
      ...(input.visible !== undefined && { visible: input.visible }),
      ...(input.isPrimary !== undefined && { isPrimary: input.isPrimary }),
    },
    include: {
      connection: true,
    },
  });

  return serializeSource(updated);
}

export async function createIcalConnection(userId: string, name: string, url: string) {
  const connection = await prisma.calendarConnection.create({
    data: {
      userId,
      provider: "ical",
      displayName: name,
      providerConfig: { url },
    },
  });

  await refreshIcalConnection(userId, connection.id);
  const refreshed = await prisma.calendarConnection.findUniqueOrThrow({
    where: { id: connection.id },
  });
  return serializeConnection(refreshed);
}

export async function ensureGoogleConnection(userId: string) {
  const connection = await ensureGoogleCalendarConnection(userId);

  if (connection) {
    return serializeConnection(connection);
  }

  const fallbackConnection =
    (await prisma.calendarConnection.findFirst({
      where: {
        userId,
        provider: "google",
      },
    })) ||
    (await prisma.calendarConnection.create({
      data: {
        userId,
        provider: "google",
        displayName: "Google Calendar",
        status: "disconnected",
      },
    }));

  return serializeConnection(fallbackConnection);
}
