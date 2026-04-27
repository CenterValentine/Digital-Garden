"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/client/ui/dialog";
import { Button } from "@/components/client/ui/button";
import { Input } from "@/components/client/ui/input";
import { Label } from "@/components/client/ui/label";
import { Textarea } from "@/components/client/ui/textarea";
import { useCalendarStore } from "@/extensions/calendar/state/calendar-store";
import { useContentStore } from "@/state/content-store";

interface CreateCalendarEventDetail {
  text?: string | null;
}

function toLocalDateTimeValue(value: string | null, allDay: boolean) {
  if (!value) return "";
  const date = new Date(value);

  if (allDay) {
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
    return localDate.toISOString().slice(0, 10);
  }

  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function fromLocalDateTimeValue(value: string, allDay: boolean) {
  if (!value) return null;

  if (allDay) {
    return new Date(`${value}T00:00:00`).toISOString();
  }

  return new Date(value).toISOString();
}

export function CalendarQuickAddDialog() {
  const {
    quickAddOpen,
    quickAddDraft,
    openQuickAdd,
    closeQuickAdd,
    sources,
    upsertEvent,
  } = useCalendarStore();
  const selectedContentId = useContentStore((state) => state.selectedContentId);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [sourceId, setSourceId] = useState("");
  const [recurrence, setRecurrence] = useState<string>("none");

  const writableSources = useMemo(
    () => sources.filter((source) => !source.isReadOnly),
    [sources]
  );

  useEffect(() => {
    setTitle(quickAddDraft?.title || "");
    setDescription(quickAddDraft?.description || "");
    const nextAllDay = Boolean(quickAddDraft?.allDay);
    setStartAt(toLocalDateTimeValue(quickAddDraft?.startAt || null, nextAllDay));
    setEndAt(toLocalDateTimeValue(quickAddDraft?.endAt || null, nextAllDay));
    setAllDay(nextAllDay);
    setSourceId(quickAddDraft?.sourceId || writableSources[0]?.id || "");
    setRecurrence("none");
  }, [quickAddDraft, writableSources]);

  useEffect(() => {
    const handler = async (event: Event) => {
      const detail = (event as CustomEvent<CreateCalendarEventDetail>).detail;
      try {
        const response = await fetch("/api/calendar/quick-add", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: detail?.text || "",
            linkedContentId: selectedContentId,
          }),
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.error || "Failed to prepare event draft");
        }
        openQuickAdd(result.data);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to prepare event draft");
      }
    };

    window.addEventListener("dg:create-calendar-event", handler as EventListener);
    return () => window.removeEventListener("dg:create-calendar-event", handler as EventListener);
  }, [openQuickAdd, selectedContentId]);

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error("Event title is required");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/calendar/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sourceId,
          title,
          description: description || null,
          startAt: fromLocalDateTimeValue(startAt, allDay) || new Date().toISOString(),
          endAt:
            fromLocalDateTimeValue(endAt, allDay) ||
            new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          allDay,
          recurrenceRule: recurrence === "none" ? null : recurrence,
          linkedContentId: quickAddDraft?.linkedContentId || selectedContentId || null,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to create event");
      }
      upsertEvent(result.data);
      closeQuickAdd();
      toast.success(`Created "${result.data.title}"`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create event");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={quickAddOpen} onOpenChange={(open) => (!open ? closeQuickAdd() : null)}>
      <DialogContent className="sm:max-w-[560px] border-white/10 bg-[#111111] text-white">
        <DialogHeader>
          <DialogTitle>New Event</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="calendar-event-title">Title</Label>
            <Input
              id="calendar-event-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Planning session"
              className="border-white/10 bg-white/5"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="calendar-event-start">Start</Label>
              <Input
                id="calendar-event-start"
                type={allDay ? "date" : "datetime-local"}
                value={startAt}
                onChange={(event) => setStartAt(event.target.value)}
                onBlur={(event) => {
                  const nextStart = event.target.value;
                  if (!nextStart || !endAt) return;
                  const startMs = new Date(nextStart).getTime();
                  const endMs = new Date(endAt).getTime();
                  if (!isNaN(startMs) && !isNaN(endMs) && endMs <= startMs) {
                    const autoEnd = new Date(startMs + 60 * 60 * 1000);
                    setEndAt(toLocalDateTimeValue(autoEnd.toISOString(), allDay));
                  }
                }}
                className="border-white/10 bg-white/5"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="calendar-event-end">End</Label>
              <Input
                id="calendar-event-end"
                type={allDay ? "date" : "datetime-local"}
                value={endAt}
                onChange={(event) => setEndAt(event.target.value)}
                className="border-white/10 bg-white/5"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="space-y-2">
              <Label htmlFor="calendar-event-source">Calendar</Label>
              <select
                id="calendar-event-source"
                value={sourceId}
                onChange={(event) => setSourceId(event.target.value)}
                className="flex h-10 w-full rounded-md border border-white/10 bg-white/5 px-3 text-sm"
              >
                {writableSources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.title}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-end gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(event) => {
                  const nextAllDay = event.target.checked;
                  setAllDay(nextAllDay);
                  setStartAt((current) =>
                    current ? toLocalDateTimeValue(fromLocalDateTimeValue(current, allDay), nextAllDay) : current
                  );
                  setEndAt((current) =>
                    current ? toLocalDateTimeValue(fromLocalDateTimeValue(current, allDay), nextAllDay) : current
                  );
                }}
              />
              All day
            </label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="calendar-event-recurrence">Repeat</Label>
            <select
              id="calendar-event-recurrence"
              value={recurrence}
              onChange={(event) => setRecurrence(event.target.value)}
              className="flex h-10 w-full rounded-md border border-white/10 bg-white/5 px-3 text-sm text-white"
            >
              <option value="none">Does not repeat</option>
              <option value="RRULE:FREQ=DAILY">Daily</option>
              <option value="RRULE:FREQ=WEEKLY">Weekly</option>
              <option value="RRULE:FREQ=WEEKLY;INTERVAL=2">Biweekly (every other week)</option>
              <option value="RRULE:FREQ=MONTHLY">Monthly</option>
              <option value="RRULE:FREQ=YEARLY">Annually</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="calendar-event-description">Description</Label>
            <Textarea
              id="calendar-event-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Details, agenda, or linked note context"
              className="min-h-28 border-white/10 bg-white/5"
            />
          </div>

          {quickAddDraft?.linkedContentId && (
            <div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
              This event will be linked to the current note.
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => closeQuickAdd()} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting || !sourceId}>
              {isSubmitting ? "Creating..." : "Create Event"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
