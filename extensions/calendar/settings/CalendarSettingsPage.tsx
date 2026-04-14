"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/client/ui/button";
import { Input } from "@/components/client/ui/input";
import { Label } from "@/components/client/ui/label";
import { Switch } from "@/components/client/ui/switch";
import { getSurfaceStyles } from "@/lib/design/system";
import type { CalendarConnectionDTO, CalendarSourceDTO } from "@/extensions/calendar/server/types";
import { CALENDAR_SETTINGS_PATH } from "@/extensions/calendar/manifest";
import type { UserSettings } from "@/lib/features/settings/validation";
import { useSettingsStore } from "@/state/settings-store";

interface ConnectionsResponse {
  success: boolean;
  data?: CalendarConnectionDTO[];
  error?: string;
}

interface BootstrapResponse {
  success: boolean;
  data?: {
    sources: CalendarSourceDTO[];
  };
  error?: string;
}

async function parseJsonResponse<T>(
  response: Response,
  fallbackMessage: string
) {
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    const body = await response.text();
    const firstLine = body.split("\n")[0]?.trim();
    throw new Error(firstLine || fallbackMessage);
  }

  return response.json() as Promise<T>;
}

export default function CalendarSettingsPage() {
  const glass0 = getSurfaceStyles("glass-0");
  const { calendar, setCalendarSettings } = useSettingsStore();
  const [connections, setConnections] = useState<CalendarConnectionDTO[]>([]);
  const [sources, setSources] = useState<CalendarSourceDTO[]>([]);
  const [icalName, setIcalName] = useState("");
  const [icalUrl, setIcalUrl] = useState("");
  const [newLocalCalendar, setNewLocalCalendar] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const primaryButtonClass =
    "border border-gold-primary/25 bg-gold-primary/12 text-gold-primary hover:bg-gold-primary/18";
  const secondaryButtonClass =
    "border border-white/12 bg-white/8 text-white hover:bg-white/12";
  const dangerButtonClass =
    "border border-red-400/20 bg-red-400/10 text-red-100 hover:bg-red-400/16";

  const localSources = useMemo(
    () => sources.filter((source) => source.provider === "local"),
    [sources]
  );
  const remoteConnections = useMemo(
    () => connections.filter((connection) => connection.provider !== "local"),
    [connections]
  );

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [connectionsResponse, bootstrapResponse] = await Promise.all([
        fetch("/api/calendar/connections"),
        fetch(
          `/api/calendar/bootstrap?start=${encodeURIComponent(
            new Date().toISOString()
          )}&end=${encodeURIComponent(
            new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
          )}`
        ),
      ]);
      const [connectionsJson, bootstrapJson] = await Promise.all([
        parseJsonResponse<ConnectionsResponse>(
          connectionsResponse,
          "Failed to load calendar connections"
        ),
        parseJsonResponse<BootstrapResponse>(
          bootstrapResponse,
          "Failed to load calendar workspace"
        ),
      ]);

      if (connectionsJson.success && connectionsJson.data) {
        setConnections(connectionsJson.data);
      } else if (connectionsJson.error) {
        throw new Error(connectionsJson.error);
      }

      if (bootstrapJson.success && bootstrapJson.data) {
        setSources(bootstrapJson.data.sources);
      } else if (bootstrapJson.error) {
        throw new Error(bootstrapJson.error);
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to load calendar settings"
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleGoogleConnect = () => {
    window.location.href = `/api/auth/google?redirect=${encodeURIComponent(
      CALENDAR_SETTINGS_PATH
    )}&scope=calendar`;
  };

  const handleGoogleSync = async (connectionId: string) => {
    const response = await fetch(`/api/calendar/connections/${connectionId}/sync`, {
      method: "POST",
    });
    const result = await parseJsonResponse<{ success: boolean; error?: string }>(
      response,
      "Failed to sync Google calendar"
    );
    if (!response.ok || !result.success) {
      toast.error(result.error || "Failed to sync Google calendar");
      return;
    }
    toast.success("Google calendar sync complete");
    await loadData();
  };

  const handleCreateIcal = async () => {
    const response = await fetch("/api/calendar/connections", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        provider: "ical",
        displayName: icalName || "Subscribed calendar",
        url: icalUrl,
      }),
    });
    const result = await parseJsonResponse<{ success: boolean; error?: string }>(
      response,
      "Failed to add iCal subscription"
    );
    if (!response.ok || !result.success) {
      toast.error(result.error || "Failed to add iCal subscription");
      return;
    }
    setIcalName("");
    setIcalUrl("");
    toast.success("Subscribed calendar added");
    await loadData();
  };

  const handleCreateLocalCalendar = async () => {
    const response = await fetch("/api/calendar/sources", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: newLocalCalendar,
      }),
    });
    const result = await parseJsonResponse<{ success: boolean; error?: string }>(
      response,
      "Failed to create local calendar"
    );
    if (!response.ok || !result.success) {
      toast.error(result.error || "Failed to create local calendar");
      return;
    }
    setNewLocalCalendar("");
    toast.success("Local calendar created");
    await loadData();
  };

  const handleSourceToggle = async (sourceId: string, visible: boolean) => {
    const response = await fetch(`/api/calendar/sources/${sourceId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ visible }),
    });
    const result = await parseJsonResponse<{
      success: boolean;
      error?: string;
      data?: CalendarSourceDTO;
    }>(response, "Failed to update calendar visibility");
    if (!response.ok || !result.success) {
      toast.error(result.error || "Failed to update calendar visibility");
      return;
    }
    if (!result.data) {
      toast.error("Calendar visibility update did not return a source");
      return;
    }

    const updatedSource = result.data;
    setSources((current) =>
      current.map((source) => (source.id === sourceId ? updatedSource : source))
    );
  };

  const handleDeleteConnection = async (connectionId: string) => {
    const response = await fetch(`/api/calendar/connections/${connectionId}`, {
      method: "DELETE",
    });
    const result = await parseJsonResponse<{ success: boolean; error?: string }>(
      response,
      "Failed to delete connection"
    );
    if (!response.ok || !result.success) {
      toast.error(result.error || "Failed to delete connection");
      return;
    }
    toast.success("Connection removed");
    await loadData();
  };

  const handleDeleteSource = async (sourceId: string) => {
    const response = await fetch(`/api/calendar/sources/${sourceId}`, {
      method: "DELETE",
    });
    const result = await parseJsonResponse<{ success: boolean; error?: string }>(
      response,
      "Failed to delete local calendar"
    );
    if (!response.ok || !result.success) {
      toast.error(result.error || "Failed to delete local calendar");
      return;
    }
    toast.success("Local calendar removed");
    await loadData();
  };

  const handleDefaultViewChange = (
    value: NonNullable<UserSettings["calendar"]>["defaultView"]
  ) => {
    void setCalendarSettings({ defaultView: value });
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Calendar</h1>
        <p className="mt-2 text-muted-foreground">
          Connect Google Calendar, subscribe to iCal feeds, and set defaults for
          the in-app calendar workspace.
        </p>
      </div>

      <section
        className="rounded-2xl border border-white/10 p-6"
        style={{
          background: glass0.background,
          backdropFilter: glass0.backdropFilter,
        }}
      >
        <h2 className="text-lg font-semibold">Workspace Preferences</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="calendar-default-view">Default View</Label>
            <select
              id="calendar-default-view"
              value={calendar?.defaultView || "dayGridMonth"}
              onChange={(event) =>
                handleDefaultViewChange(
                  event.target.value as NonNullable<
                    UserSettings["calendar"]
                  >["defaultView"]
                )
              }
              className="flex h-10 w-full rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm"
            >
              <option value="dayGridMonth">Month</option>
              <option value="timeGridWeek">Week</option>
              <option value="timeGridDay">Day</option>
              <option value="listWeek">Agenda</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="calendar-duration">Default Event Duration (minutes)</Label>
            <Input
              id="calendar-duration"
              type="number"
              min={15}
              step={15}
              value={calendar?.defaultEventDurationMinutes || 60}
              onChange={(event) =>
                void setCalendarSettings({
                  defaultEventDurationMinutes: Number(event.target.value),
                })
              }
            />
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between rounded-xl border border-white/10 px-4 py-3">
            <div>
              <p className="text-sm font-medium">Show Weekends</p>
              <p className="text-sm text-gray-400">
                Keep Saturday and Sunday visible in FullCalendar.
              </p>
            </div>
            <Switch
              checked={calendar?.showWeekends ?? true}
              onCheckedChange={(checked) =>
                void setCalendarSettings({ showWeekends: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-white/10 px-4 py-3">
            <div>
              <p className="text-sm font-medium">Show Declined Events</p>
              <p className="text-sm text-gray-400">
                Hide declined Google events if you want a cleaner calendar.
              </p>
            </div>
            <Switch
              checked={calendar?.showDeclinedEvents ?? true}
              onCheckedChange={(checked) =>
                void setCalendarSettings({ showDeclinedEvents: checked })
              }
            />
          </div>
        </div>
      </section>

      <section
        className="rounded-2xl border border-white/10 p-6"
        style={{
          background: glass0.background,
          backdropFilter: glass0.backdropFilter,
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Connections</h2>
            <p className="mt-1 text-sm text-gray-400">
              Manage remote calendars and refresh their sync state.
            </p>
          </div>
          <Button className={primaryButtonClass} onClick={handleGoogleConnect}>
            Connect Google Calendar
          </Button>
        </div>

        <div className="mt-6 space-y-3">
          {isLoading && <p className="text-sm text-gray-400">Loading connections...</p>}

          {!isLoading && remoteConnections.length === 0 && (
            <p className="text-sm text-gray-400">No calendar connections yet.</p>
          )}

          {remoteConnections.map((connection) => (
            <div
              key={connection.id}
              className="flex flex-col gap-3 rounded-xl border border-white/10 px-4 py-3 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <p className="font-medium">{connection.displayName}</p>
                <p className="text-sm text-gray-400">
                  {connection.provider.toUpperCase()} · {connection.status} · Sync{" "}
                  {connection.syncStatus}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  className={secondaryButtonClass}
                  onClick={() => void handleGoogleSync(connection.id)}
                >
                  Sync
                </Button>
                <Button
                  variant="outline"
                  className={dangerButtonClass}
                  onClick={() => void handleDeleteConnection(connection.id)}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <Input
            placeholder="Subscribed calendar name"
            value={icalName}
            onChange={(event) => setIcalName(event.target.value)}
          />
          <Input
            placeholder="https://example.com/calendar.ics"
            value={icalUrl}
            onChange={(event) => setIcalUrl(event.target.value)}
          />
          <Button
            className={primaryButtonClass}
            onClick={() => void handleCreateIcal()}
            disabled={!icalUrl.trim()}
          >
            Add iCal
          </Button>
        </div>
      </section>

      <section
        className="rounded-2xl border border-white/10 p-6"
        style={{
          background: glass0.background,
          backdropFilter: glass0.backdropFilter,
        }}
      >
        <h2 className="text-lg font-semibold">Local Calendars</h2>
        <p className="mt-1 text-sm text-gray-400">
          Create app-native calendars for planning that does not need an
          external provider.
        </p>

        <div className="mt-4 flex gap-3">
          <Input
            placeholder="New local calendar"
            value={newLocalCalendar}
            onChange={(event) => setNewLocalCalendar(event.target.value)}
          />
          <Button
            className={primaryButtonClass}
            onClick={() => void handleCreateLocalCalendar()}
            disabled={!newLocalCalendar.trim()}
          >
            Create Local Calendar
          </Button>
        </div>

        <div className="mt-6 space-y-3">
          {localSources.map((source) => (
            <div
              key={source.id}
              className="flex flex-col gap-3 rounded-xl border border-white/10 px-4 py-3 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <p className="font-medium">{source.title}</p>
                <p className="text-sm text-gray-400">
                  {source.visible ? "Visible" : "Hidden"} ·{" "}
                  {source.isPrimary ? "Primary" : "Secondary"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-400">Visible</span>
                  <Switch
                    checked={source.visible}
                    onCheckedChange={(checked) =>
                      void handleSourceToggle(source.id, checked)
                    }
                  />
                </div>
                <Button
                  variant="outline"
                  className={dangerButtonClass}
                  onClick={() => void handleDeleteSource(source.id)}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
