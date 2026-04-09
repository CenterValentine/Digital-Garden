"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type FullCalendarComponent from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import rrulePlugin from "@fullcalendar/rrule";
import { addDays, endOfMonth, endOfWeek, startOfMonth, startOfWeek } from "date-fns";
import type { DateSelectArg, DatesSetArg, EventChangeArg, EventClickArg } from "@fullcalendar/core";
import { ChevronLeft, ChevronRight, CalendarDays, Plus, RefreshCcw } from "lucide-react";
import { Button } from "@/components/client/ui/button";
import { useCalendarStore } from "@/extensions/calendar/state/calendar-store";
import { useSettingsStore } from "@/state/settings-store";

const FullCalendar = dynamic(() => import("@fullcalendar/react"), {
  ssr: false,
}) as typeof FullCalendarComponent;

function rangeForDate(view: string, selectedDate: Date) {
  if (view === "timeGridWeek" || view === "listWeek") {
    return {
      start: startOfWeek(selectedDate, { weekStartsOn: 0 }),
      end: addDays(endOfWeek(selectedDate, { weekStartsOn: 0 }), 1),
    };
  }

  if (view === "timeGridDay") {
    return {
      start: selectedDate,
      end: addDays(selectedDate, 1),
    };
  }

  return {
    start: startOfWeek(startOfMonth(selectedDate), { weekStartsOn: 0 }),
    end: addDays(endOfWeek(endOfMonth(selectedDate), { weekStartsOn: 0 }), 1),
  };
}

export function CalendarWorkspace() {
  const calendarRef = useRef<FullCalendarComponent | null>(null);
  const {
    view,
    setView,
    selectedDate,
    setSelectedDate,
    fetchWorkspace,
    events,
    sources,
    isLoading,
    error,
    selectEvent,
    openQuickAdd,
    upsertEvent,
  } = useCalendarStore();
  const calendarSettings = useSettingsStore((state) => state.calendar);
  const [title, setTitle] = useState("Calendar");

  useEffect(() => {
    if (calendarSettings?.defaultView) {
      setView(calendarSettings.defaultView);
    }
  }, [calendarSettings?.defaultView, setView]);

  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    api.changeView(view);
    api.gotoDate(selectedDate);
  }, [selectedDate, view]);

  const calendarEvents = useMemo(
    () =>
      events.map((event) => ({
        id: event.id,
        title: event.title,
        start: event.startAt,
        end: event.endAt,
        allDay: event.allDay,
        backgroundColor: event.source.color,
        borderColor: event.source.color,
        extendedProps: event,
      })),
    [events]
  );

  const handleDatesSet = (arg: DatesSetArg) => {
    setTitle(arg.view.title);
    void fetchWorkspace(arg.start.toISOString(), arg.end.toISOString());
  };

  const handleSelect = (selection: DateSelectArg) => {
    const defaultSource = sources.find((source) => !source.isReadOnly && source.visible) || sources.find((source) => !source.isReadOnly);
    openQuickAdd({
      title: "",
      startAt: selection.start.toISOString(),
      endAt: selection.end.toISOString(),
      allDay: selection.allDay,
      timezone: null,
      description: null,
      linkedContentId: null,
      sourceId: defaultSource?.id || null,
    });
  };

  const handleEventClick = (click: EventClickArg) => {
    selectEvent(click.event.id);
  };

  const handleEventChange = async (change: EventChangeArg) => {
    try {
      const response = await fetch(`/api/calendar/events/${change.event.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startAt: change.event.start?.toISOString(),
          endAt: change.event.end?.toISOString() || change.event.start?.toISOString(),
          allDay: change.event.allDay,
        }),
      });
      const result = await response.json();
      if (response.ok && result.success) {
        upsertEvent(result.data);
      }
    } catch (error) {
      console.error("[CalendarWorkspace] Failed to persist drag/resize:", error);
    }
  };

  const navigate = (direction: "prev" | "next" | "today") => {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    if (direction === "prev") api.prev();
    if (direction === "next") api.next();
    if (direction === "today") api.today();
    setSelectedDate(api.getDate().toISOString());
    setTitle(api.view.title);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-6 py-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("today")}>
            Today
          </Button>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => navigate("prev")}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => navigate("next")}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Workspace</p>
            <h2 className="text-xl font-semibold text-white">{title}</h2>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 p-1">
            {[
              ["dayGridMonth", "Month"],
              ["timeGridWeek", "Week"],
              ["timeGridDay", "Day"],
              ["listWeek", "Agenda"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setView(value as typeof view)}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  view === value ? "bg-white text-black" : "text-gray-300 hover:bg-white/10"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const range = rangeForDate(view, new Date(selectedDate));
              void fetchWorkspace(range.start.toISOString(), range.end.toISOString());
            }}
          >
            <RefreshCcw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button onClick={() => openQuickAdd(null)}>
            <Plus className="mr-2 h-4 w-4" />
            New Event
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden px-4 pb-4 pt-2">
        {error ? (
          <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/5 text-center text-red-200">
            <CalendarDays className="mb-3 h-10 w-10" />
            <p className="text-lg font-medium">Calendar failed to load</p>
            <p className="mt-1 max-w-md text-sm text-red-200/80">{error}</p>
          </div>
        ) : (
          <div className="dg-calendar-shell relative h-full overflow-hidden rounded-2xl border border-black/10 bg-white/80 p-4 text-[#465E73] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] [--fc-border-color:rgba(70,94,115,0.22)] [--fc-list-event-hover-bg-color:rgba(70,94,115,0.08)] [--fc-neutral-bg-color:rgba(70,94,115,0.04)] [--fc-page-bg-color:transparent] [--fc-today-bg-color:rgba(201,168,108,0.24)]">
            <FullCalendar
              ref={calendarRef}
              plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin, rrulePlugin]}
              initialView={view}
              headerToolbar={false}
              nowIndicator
              editable
              selectable
              dayMaxEvents
              slotDuration="00:15:00"
              snapDuration="00:15:00"
              slotLabelInterval="01:00:00"
              weekends={calendarSettings?.showWeekends ?? true}
              firstDay={calendarSettings?.firstDayOfWeek ?? 0}
              dayHeaderFormat={
                view === "timeGridDay"
                  ? { weekday: "long", month: "short", day: "numeric" }
                  : undefined
              }
              eventTimeFormat={{ hour: "numeric", minute: "2-digit", meridiem: "short" }}
              events={calendarEvents}
              datesSet={handleDatesSet}
              select={handleSelect}
              eventClick={handleEventClick}
              eventChange={handleEventChange}
              expandRows
              height="100%"
            />
            {isLoading && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20 text-sm text-white">
                Loading calendar...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
