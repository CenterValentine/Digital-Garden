"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/client/ui/button";
import { Input } from "@/components/client/ui/input";
import { Label } from "@/components/client/ui/label";
import { Textarea } from "@/components/client/ui/textarea";
import { useCalendarStore } from "@/extensions/calendar/state/calendar-store";
import { useContentStore } from "@/state/content-store";
import { useLeftPanelViewStore } from "@/state/left-panel-view-store";

interface FolderOption {
  id: string;
  title: string;
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

export function CalendarInspector() {
  const { events, selectedEventId, selectEvent, upsertEvent, removeEvent } = useCalendarStore();
  const setSelectedContentId = useContentStore((state) => state.setSelectedContentId);
  const setActiveView = useLeftPanelViewStore((state) => state.setActiveView);
  const event = useMemo(
    () => events.find((candidate) => candidate.id === selectedEventId) || null,
    [events, selectedEventId]
  );
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [folderOptions, setFolderOptions] = useState<FolderOption[]>([]);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteParentId, setNoteParentId] = useState("root");
  const [isCreatingNote, setIsCreatingNote] = useState(false);

  useEffect(() => {
    setTitle(event?.title || "");
    setDescription(event?.description || "");
    setLocation(event?.location || "");
    setAllDay(Boolean(event?.allDay));
    setStartAt(toLocalDateTimeValue(event?.startAt || null, Boolean(event?.allDay)));
    setEndAt(toLocalDateTimeValue(event?.endAt || null, Boolean(event?.allDay)));
    setNoteTitle(event ? `${event.title} Notes` : "");
    setNoteParentId("root");
  }, [event]);

  useEffect(() => {
    if (!event) {
      setFolderOptions([]);
      return;
    }

    const loadFolders = async () => {
      try {
        const response = await fetch("/api/content/content?type=folder&limit=500", {
          credentials: "include",
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.error?.message || "Failed to load folders");
        }

        setFolderOptions(
          (result.data?.items || []).map((item: { id: string; title: string }) => ({
            id: item.id,
            title: item.title,
          }))
        );
      } catch (error) {
        console.error("[CalendarInspector] Failed to load folders:", error);
      }
    };

    void loadFolders();
  }, [event]);

  if (!event) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-gray-500">Event Inspector</p>
          <h3 className="mt-2 text-lg font-semibold text-white">Select an event</h3>
          <p className="mt-2 text-sm text-gray-400">
            Click an event in the calendar or upcoming list to inspect it here.
          </p>
        </div>
      </div>
    );
  }

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/calendar/events/${event.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          description,
          location,
          startAt: fromLocalDateTimeValue(startAt, allDay),
          endAt: fromLocalDateTimeValue(endAt, allDay),
          allDay,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to save event");
      }
      upsertEvent(result.data);
      toast.success("Event updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save event");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      const response = await fetch(`/api/calendar/events/${event.id}`, {
        method: "DELETE",
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to delete event");
      }
      removeEvent(event.id);
      toast.success("Event deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete event");
    }
  };

  const handleCreateNote = async () => {
    if (!event) return;
    if (!noteTitle.trim()) {
      toast.error("Note title is required");
      return;
    }

    setIsCreatingNote(true);
    try {
      const noteResponse = await fetch("/api/content/content", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: noteTitle.trim(),
          parentId: noteParentId === "root" ? null : noteParentId,
          markdown: [
            `# ${noteTitle.trim()}`,
            "",
            `Linked to calendar event: ${event.title}`,
            "",
            `- Start: ${format(new Date(event.startAt), "PPpp")}`,
            `- End: ${format(new Date(event.endAt), "PPpp")}`,
            location ? `- Location: ${location}` : null,
            "",
            description ? description : "",
          ]
            .filter(Boolean)
            .join("\n"),
        }),
      });
      const noteResult = await noteResponse.json();

      if (!noteResponse.ok || !noteResult.success) {
        throw new Error(noteResult.error?.message || "Failed to create note");
      }

      const eventResponse = await fetch(`/api/calendar/events/${event.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          linkedContentId: noteResult.data.id,
        }),
      });
      const eventResult = await eventResponse.json();

      if (!eventResponse.ok || !eventResult.success) {
        throw new Error(eventResult.error || "Failed to link note to event");
      }

      upsertEvent(eventResult.data);
      setActiveView("files");
      setSelectedContentId(noteResult.data.id);
      toast.success("Event note created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create event note");
    } finally {
      setIsCreatingNote(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto px-4 py-4">
      <div className="mb-4">
        <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Event Inspector</p>
        <h3 className="mt-2 text-xl font-semibold text-white">{event.title}</h3>
        <p className="mt-1 text-sm text-gray-400">
          {format(new Date(event.startAt), "EEEE, MMM d • p")}
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="calendar-inspector-title">Title</Label>
          <Input
            id="calendar-inspector-title"
            value={title}
            onChange={(input) => setTitle(input.target.value)}
            className="border-white/10 bg-white/5"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="calendar-inspector-location">Location</Label>
          <Input
            id="calendar-inspector-location"
            value={location}
            onChange={(input) => setLocation(input.target.value)}
            className="border-white/10 bg-white/5"
          />
        </div>

        <div className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="calendar-inspector-start">Start</Label>
            <Input
              id="calendar-inspector-start"
              type={allDay ? "date" : "datetime-local"}
              value={startAt}
              onChange={(input) => setStartAt(input.target.value)}
              className="border-white/10 bg-white/5"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="calendar-inspector-end">End</Label>
            <Input
              id="calendar-inspector-end"
              type={allDay ? "date" : "datetime-local"}
              value={endAt}
              onChange={(input) => setEndAt(input.target.value)}
              className="border-white/10 bg-white/5"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(input) => {
              const nextAllDay = input.target.checked;
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

        <div className="space-y-2">
          <Label htmlFor="calendar-inspector-description">Description</Label>
          <Textarea
            id="calendar-inspector-description"
            value={description}
            onChange={(input) => setDescription(input.target.value)}
            className="min-h-32 border-white/10 bg-white/5"
          />
        </div>

        <div className="rounded-xl border border-white/5 bg-white/[0.04] px-3 py-3 text-sm text-gray-300">
          <div className="flex items-center justify-between gap-3">
            <span>Calendar</span>
            <span className="font-medium text-white">{event.source.title}</span>
          </div>
          {event.linkedNote && (
            <div className="mt-3 flex items-center justify-between gap-3">
              <span>Linked note</span>
              <button
                type="button"
                className="text-emerald-300 transition-colors hover:text-emerald-200"
                onClick={() => {
                  setActiveView("files");
                  setSelectedContentId(event.linkedNote?.id || null);
                }}
              >
                {event.linkedNote.title}
              </button>
            </div>
          )}
        </div>

        {!event.linkedNote && (
          <div className="rounded-xl border border-white/5 bg-white/[0.04] px-3 py-3">
            <p className="mb-3 text-xs uppercase tracking-[0.18em] text-gray-500">Event Note</p>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="calendar-event-note-title">Note Title</Label>
                <Input
                  id="calendar-event-note-title"
                  value={noteTitle}
                  onChange={(input) => setNoteTitle(input.target.value)}
                  className="border-white/10 bg-white/5"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="calendar-event-note-folder">Folder</Label>
                <select
                  id="calendar-event-note-folder"
                  value={noteParentId}
                  onChange={(input) => setNoteParentId(input.target.value)}
                  className="flex h-10 w-full rounded-md border border-white/10 bg-white/5 px-3 text-sm text-white"
                >
                  <option value="root">Root</option>
                  {folderOptions.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.title}
                    </option>
                  ))}
                </select>
              </div>
              <Button onClick={() => void handleCreateNote()} disabled={isCreatingNote}>
                {isCreatingNote ? "Creating Note..." : "Create Linked Note"}
              </Button>
            </div>
          </div>
        )}

        {event.attendees.length > 0 && (
          <div className="rounded-xl border border-white/5 bg-white/[0.04] px-3 py-3">
            <p className="mb-2 text-xs uppercase tracking-[0.18em] text-gray-500">Attendees</p>
            <div className="space-y-2">
              {event.attendees.map((attendee) => (
                <div key={attendee.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-white">{attendee.displayName || attendee.email}</span>
                  <span className="text-gray-400">{attendee.responseStatus.replace("_", " ")}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button variant="ghost" onClick={() => selectEvent(null)}>
            Close
          </Button>
          <Button variant="outline" onClick={() => void handleDelete()}>
            Delete
          </Button>
          <Button onClick={() => void handleSave()} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
