"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import { Calendar } from "@/components/client/ui/calendar";
import { useCalendarStore } from "@/state/calendar-store";
import { Button } from "@/components/client/ui/button";

export function CalendarCompanionPanel() {
  const {
    selectedDate,
    setSelectedDate,
    upcoming,
    sources,
    rangeStart,
    rangeEnd,
    fetchWorkspace,
    selectEvent,
    updateSource,
    openQuickAdd,
  } = useCalendarStore();

  const selected = useMemo(() => new Date(selectedDate), [selectedDate]);
  const visibleSources = useMemo(
    () => sources.filter((source) => source.visible),
    [sources]
  );

  const handleSourceToggle = async (sourceId: string, visible: boolean) => {
    const response = await fetch(`/api/calendar/sources/${sourceId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ visible }),
    });
    const result = await response.json();
    if (response.ok && result.success) {
      updateSource(result.data);
      if (rangeStart && rangeEnd) {
        await fetchWorkspace(rangeStart, rangeEnd);
      }
    }
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b border-white/10 px-4 py-4">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Calendar</p>
            <h3 className="text-lg font-semibold text-white">{format(selected, "MMMM yyyy")}</h3>
          </div>
          <Button size="sm" variant="ghost" onClick={() => openQuickAdd(null)}>
            New
          </Button>
        </div>

        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => {
            if (date) setSelectedDate(date.toISOString());
          }}
          className="w-full bg-transparent p-0"
        />
      </div>

      <div className="border-b border-white/10 px-4 py-4">
        <p className="mb-3 text-xs uppercase tracking-[0.18em] text-gray-500">Calendars</p>
        <div className="space-y-2">
          {sources.map((source) => (
            <label key={source.id} className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm text-gray-200 hover:bg-white/5">
              <input
                type="checkbox"
                checked={source.visible}
                onChange={(event) => void handleSourceToggle(source.id, event.target.checked)}
              />
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: source.color }} />
              <span className="flex-1 truncate">{source.title}</span>
              <span className="text-[11px] uppercase tracking-wide text-gray-500">{source.provider}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="border-b border-white/10 px-4 py-4">
        <p className="mb-3 text-xs uppercase tracking-[0.18em] text-gray-500">Upcoming</p>
        <div className="space-y-2">
          {upcoming.length === 0 ? (
            <p className="text-sm text-gray-500">No upcoming events yet.</p>
          ) : (
            upcoming.map((event) => (
              <button
                key={event.id}
                type="button"
                onClick={() => selectEvent(event.id)}
                className="w-full rounded-xl border border-white/5 bg-white/[0.04] px-3 py-3 text-left transition-colors hover:bg-white/[0.08]"
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: event.source.color }} />
                  <span className="truncate font-medium text-white">{event.title}</span>
                </div>
                <p className="text-xs text-gray-400">
                  {format(new Date(event.startAt), "EEE, MMM d • p")}
                </p>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="px-4 py-4">
        <p className="text-xs text-gray-500">
          Showing {visibleSources.length} of {sources.length} calendars
        </p>
      </div>
    </div>
  );
}
