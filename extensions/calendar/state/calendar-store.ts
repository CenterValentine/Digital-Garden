import { create } from "zustand";
import type {
  CalendarConnectionDTO,
  CalendarEventDTO,
  CalendarQuickAddDraft,
  CalendarSourceDTO,
  CalendarWorkspaceResponse,
  CalendarWorkspaceView,
} from "@/extensions/calendar/server/types";

async function parseJsonResponse<T>(response: Response, fallbackMessage: string) {
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    const body = await response.text();
    const firstLine = body.split("\n")[0]?.trim();
    throw new Error(firstLine || fallbackMessage);
  }

  return response.json() as Promise<T>;
}

interface CalendarStore {
  view: CalendarWorkspaceView;
  selectedDate: string;
  rangeStart: string | null;
  rangeEnd: string | null;
  isLoading: boolean;
  error: string | null;
  connections: CalendarConnectionDTO[];
  sources: CalendarSourceDTO[];
  events: CalendarEventDTO[];
  upcoming: CalendarEventDTO[];
  selectedEventId: string | null;
  quickAddOpen: boolean;
  quickAddDraft: CalendarQuickAddDraft | null;
  setView: (view: CalendarWorkspaceView) => void;
  setSelectedDate: (date: string) => void;
  selectEvent: (eventId: string | null) => void;
  fetchWorkspace: (start: string, end: string) => Promise<void>;
  upsertEvent: (event: CalendarEventDTO) => void;
  removeEvent: (eventId: string) => void;
  updateSource: (source: CalendarSourceDTO) => void;
  openQuickAdd: (draft?: CalendarQuickAddDraft | null) => void;
  closeQuickAdd: () => void;
}

export const useCalendarStore = create<CalendarStore>((set) => ({
  view: "dayGridMonth",
  selectedDate: new Date().toISOString(),
  rangeStart: null,
  rangeEnd: null,
  isLoading: false,
  error: null,
  connections: [],
  sources: [],
  events: [],
  upcoming: [],
  selectedEventId: null,
  quickAddOpen: false,
  quickAddDraft: null,
  setView: (view) => set({ view }),
  setSelectedDate: (selectedDate) => set({ selectedDate }),
  selectEvent: (selectedEventId) => set({ selectedEventId }),
  fetchWorkspace: async (start, end) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(
        `/api/calendar/bootstrap?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
      );
      const result = await parseJsonResponse<{
        success: boolean;
        data?: CalendarWorkspaceResponse;
        error?: string;
      }>(response, "Failed to load calendar");

      if (!response.ok || !result.success || !result.data) {
        throw new Error(result.error || "Failed to load calendar");
      }

      set({
        isLoading: false,
        rangeStart: result.data.range.start,
        rangeEnd: result.data.range.end,
        connections: result.data.connections,
        sources: result.data.sources,
        events: result.data.events,
        upcoming: result.data.upcoming,
        error: null,
      });
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : "Failed to load calendar",
      });
    }
  },
  upsertEvent: (event) =>
    set((state) => ({
      events: state.events.some((existing) => existing.id === event.id)
        ? state.events.map((existing) => (existing.id === event.id ? event : existing))
        : [...state.events, event].sort((a, b) => a.startAt.localeCompare(b.startAt)),
      upcoming: state.upcoming.some((existing) => existing.id === event.id)
        ? state.upcoming.map((existing) => (existing.id === event.id ? event : existing))
        : [...state.upcoming, event]
            .sort((a, b) => a.startAt.localeCompare(b.startAt))
            .slice(0, 10),
    })),
  removeEvent: (eventId) =>
    set((state) => ({
      events: state.events.filter((event) => event.id !== eventId),
      upcoming: state.upcoming.filter((event) => event.id !== eventId),
      selectedEventId: state.selectedEventId === eventId ? null : state.selectedEventId,
    })),
  updateSource: (source) =>
    set((state) => ({
      sources: state.sources.some((existing) => existing.id === source.id)
        ? state.sources.map((existing) => (existing.id === source.id ? source : existing))
        : [...state.sources, source].sort((a, b) => a.title.localeCompare(b.title)),
    })),
  openQuickAdd: (quickAddDraft) => set({ quickAddOpen: true, quickAddDraft: quickAddDraft ?? null }),
  closeQuickAdd: () => set({ quickAddOpen: false, quickAddDraft: null }),
}));
