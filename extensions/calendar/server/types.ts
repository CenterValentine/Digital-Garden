import type { Prisma } from "@/lib/database/generated/prisma";

export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

export type CalendarWorkspaceView =
  | "dayGridMonth"
  | "timeGridWeek"
  | "timeGridDay"
  | "listWeek";

export interface CalendarConnectionDTO {
  id: string;
  provider: "local" | "google" | "ical";
  displayName: string;
  status: "active" | "disconnected" | "error" | "reconnect_required";
  syncStatus: "idle" | "syncing" | "success" | "error";
  providerConfig: Record<string, unknown>;
  syncCursor: string | null;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarSourceDTO {
  id: string;
  connectionId: string | null;
  provider: "local" | "google" | "ical";
  title: string;
  color: string;
  timezone: string | null;
  visible: boolean;
  isReadOnly: boolean;
  isPrimary: boolean;
  syncMode: "local" | "imported" | "subscription";
  externalCalendarId: string | null;
  metadata: Record<string, unknown>;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
}

export interface CalendarEventAttendeeDTO {
  id: string;
  email: string;
  displayName: string | null;
  isOrganizer: boolean;
  responseStatus: "needs_action" | "accepted" | "tentative" | "declined";
}

export interface CalendarLinkedNoteDTO {
  id: string;
  title: string;
  slug: string;
}

export interface CalendarEventDTO {
  id: string;
  sourceId: string;
  externalEventId: string | null;
  title: string;
  description: string | null;
  location: string | null;
  startAt: string;
  endAt: string;
  allDay: boolean;
  timezone: string | null;
  recurrenceRule: string | null;
  recurrenceExDates: string[];
  recurrenceOverrides: Record<string, unknown>;
  status: "confirmed" | "tentative" | "cancelled";
  meetingUrl: string | null;
  linkedContentId: string | null;
  linkedNote: CalendarLinkedNoteDTO | null;
  providerMetadata: Record<string, unknown>;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
  source: Pick<CalendarSourceDTO, "id" | "provider" | "title" | "color" | "isReadOnly">;
  attendees: CalendarEventAttendeeDTO[];
}

export interface CalendarWorkspaceResponse {
  range: {
    start: string;
    end: string;
  };
  connections: CalendarConnectionDTO[];
  sources: CalendarSourceDTO[];
  events: CalendarEventDTO[];
  upcoming: CalendarEventDTO[];
}

export interface CalendarEventMutationInput {
  sourceId: string;
  title: string;
  description?: string | null;
  location?: string | null;
  startAt: string;
  endAt: string;
  allDay?: boolean;
  timezone?: string | null;
  recurrenceRule?: string | null;
  recurrenceExDates?: string[];
  recurrenceOverrides?: Record<string, unknown>;
  status?: "confirmed" | "tentative" | "cancelled";
  meetingUrl?: string | null;
  linkedContentId?: string | null;
  attendees?: Array<{
    email: string;
    displayName?: string | null;
    isOrganizer?: boolean;
    responseStatus?: "needs_action" | "accepted" | "tentative" | "declined";
  }>;
}

export interface CalendarSourceMutationInput {
  title: string;
  color?: string;
  timezone?: string | null;
  visible?: boolean;
  isPrimary?: boolean;
}

export interface CalendarQuickAddDraft {
  title: string;
  startAt: string | null;
  endAt: string | null;
  allDay: boolean;
  timezone: string | null;
  description: string | null;
  linkedContentId: string | null;
  sourceId: string | null;
}

export type CalendarEventWithRelations = Prisma.CalendarEventGetPayload<{
  include: {
    attendees: true;
    linkedContent: {
      select: {
        id: true;
        title: true;
        slug: true;
      };
    };
    source: {
      include: {
        connection: true;
      };
    };
  };
}>;
