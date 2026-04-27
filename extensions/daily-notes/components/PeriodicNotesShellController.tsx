"use client";

import { useEffect, useMemo, useRef } from "react";
import moment from "moment";
import { toast } from "sonner";
import { getNextPeriodicRolloverDelay } from "@/lib/domain/periodic-notes";
import { getPeriodicNotesSettings } from "@/lib/domain/periodic-notes/settings";
import type { PeriodicNoteKind } from "@/lib/domain/periodic-notes/types";
import { useSettingsStore } from "@/state/settings-store";

export function PeriodicNotesShellController() {
  const periodicNotes = useSettingsStore((state) => state.periodicNotes);
  const isSyncingSettings = useSettingsStore((state) => state.isSyncing);
  const hasPendingSettingsChanges = useSettingsStore(
    (state) => state.hasPendingChanges
  );
  const settings = useMemo(
    () => getPeriodicNotesSettings({ periodicNotes }),
    [periodicNotes]
  );
  const lastAutoCreateKeyRef = useRef<string | null>(null);
  const lastFailureKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (isSyncingSettings || hasPendingSettingsChanges) return;

    let timeoutId: number | null = null;
    let retryTimeoutId: number | null = null;
    const runAutoCreate = async () => {
      const localDateTime = moment().format("YYYY-MM-DDTHH:mm:ss");
      const dailyKey = moment(localDateTime).format("YYYY-MM-DD");
      const weeklyKey = moment(localDateTime)
        .clone()
        .startOf("isoWeek")
        .format("GGGG-[W]WW");
      const runKey = [
        settings.daily.enabled && settings.daily.autoCreateOnOpen
          ? `daily:${dailyKey}`
          : null,
        settings.weekly.enabled && settings.weekly.autoCreateOnOpen
          ? `weekly:${weeklyKey}`
          : null,
      ]
        .filter(Boolean)
        .join("|");

      if (!runKey || lastAutoCreateKeyRef.current === runKey) return;

      const results = await Promise.all([
        maybeResolvePeriodicNote("daily", localDateTime, settings.daily.enabled && settings.daily.autoCreateOnOpen),
        maybeResolvePeriodicNote("weekly", localDateTime, settings.weekly.enabled && settings.weekly.autoCreateOnOpen),
      ]);
      const requestedResults = results.filter((result) => result.requested);
      const failedResult = requestedResults.find((result) => !result.ok);

      if (failedResult) {
        if (lastFailureKeyRef.current !== runKey) {
          lastFailureKeyRef.current = runKey;
          toast.error("Periodic note auto-create failed", {
            description: failedResult.errorMessage ?? "Try refreshing the app.",
          });
        }
        retryTimeoutId = window.setTimeout(() => {
          void runAutoCreate();
        }, 30_000);
        return;
      }

      if (results.some((result) => result.ok && result.created)) {
        window.dispatchEvent(new CustomEvent("dg:tree-refresh"));
      }
      if (requestedResults.length > 0) {
        lastAutoCreateKeyRef.current = runKey;
        lastFailureKeyRef.current = null;
      }
    };

    const scheduleNextRun = () => {
      timeoutId = window.setTimeout(() => {
        void runAutoCreate().finally(scheduleNextRun);
      }, getNextPeriodicRolloverDelay());
    };

    void runAutoCreate();
    scheduleNextRun();

    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      if (retryTimeoutId) window.clearTimeout(retryTimeoutId);
    };
  }, [hasPendingSettingsChanges, isSyncingSettings, settings]);

  return null;
}

async function maybeResolvePeriodicNote(
  kind: PeriodicNoteKind,
  localDateTime: string,
  shouldCreate: boolean
) {
  if (!shouldCreate) return { requested: false, ok: true, created: false };

  try {
    const response = await fetch("/api/periodic-notes/resolve", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        kind,
        localDateTime,
      }),
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      console.warn(
        "[PeriodicNotesShellController] Auto-create resolve failed:",
        result.error?.message ?? response.statusText
      );
      return {
        requested: true,
        ok: false,
        created: false,
        errorMessage: result.error?.message ?? response.statusText,
      };
    }
    return { requested: true, ok: true, created: Boolean(result.data?.created) };
  } catch (error) {
    console.error("[PeriodicNotesShellController] Auto-create failed:", error);
    return {
      requested: true,
      ok: false,
      created: false,
      errorMessage: error instanceof Error ? error.message : "Request failed",
    };
  }
}
