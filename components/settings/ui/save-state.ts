"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { UserSettings } from "@/lib/features/settings/validation";
import { useSettingsStore } from "@/state/settings-store";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

const SAVED_VISIBLE_MS = 2000;

export interface TransientSaveState {
  status: SaveStatus;
  error: string | null;
  markSaving: () => void;
  markSaved: () => void;
  markError: (message?: string) => void;
}

/**
 * Local save-feedback state machine: saving → saved (auto-fades) | error.
 * Base for all settings save indicators, including synchronous
 * localStorage-backed stores where "saving" is instantaneous.
 */
export function useTransientSaved(): TransientSaveState {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const markSaving = useCallback(() => {
    clearTimer();
    setError(null);
    setStatus("saving");
  }, [clearTimer]);

  const markSaved = useCallback(() => {
    clearTimer();
    setError(null);
    setStatus("saved");
    timerRef.current = setTimeout(() => setStatus("idle"), SAVED_VISIBLE_MS);
  }, [clearTimer]);

  const markError = useCallback(
    (message?: string) => {
      clearTimer();
      setError(message ?? "Save failed");
      setStatus("error");
    },
    [clearTimer]
  );

  return { status, error, markSaving, markSaved, markError };
}

/**
 * Save feedback for the settings-store section updaters (setUISettings,
 * setAISettings, …). Those updaters swallow failures into store state
 * instead of rejecting, so success is confirmed by checking the store's
 * error field after the promise resolves — not by try/catch alone.
 */
export function useSaveTracker() {
  const { status, error, markSaving, markSaved, markError } =
    useTransientSaved();

  const track = useCallback(
    async (save: Promise<unknown>) => {
      markSaving();
      try {
        await save;
        const storeError = useSettingsStore.getState().error;
        if (storeError) {
          markError(storeError);
          toast.error("Failed to save settings", { description: storeError });
        } else {
          markSaved();
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Save failed";
        markError(message);
        toast.error("Failed to save settings", { description: message });
      }
    },
    [markSaving, markSaved, markError]
  );

  return { status, error, track };
}

/**
 * Debounced instant-apply for settings sections that persist via direct
 * partial PATCH (fileTree, external — no store updater exists for them).
 * Sends the whole section object per save, matching the request shape the
 * old per-section Save buttons produced, so persistence behavior is
 * unchanged — only the timing differs. Pending changes flush on unmount.
 */
export function usePatchSettingsSection<K extends keyof UserSettings & string>(
  section: K,
  options: { debounceMs?: number } = {}
) {
  const { debounceMs = 400 } = options;
  const { status, error, markSaving, markSaved, markError } =
    useTransientSaved();
  const pendingRef = useRef<NonNullable<UserSettings[K]> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const send = useCallback(
    async (value: NonNullable<UserSettings[K]>) => {
      markSaving();
      try {
        const response = await fetch("/api/user/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [section]: value }),
        });
        const data = await response.json();
        if (!data.success) {
          throw new Error(data.error || "Save failed");
        }
        markSaved();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Save failed";
        markError(message);
        toast.error("Failed to save settings", { description: message });
      }
    },
    [section, markSaving, markSaved, markError]
  );

  const patch = useCallback(
    (value: NonNullable<UserSettings[K]>) => {
      pendingRef.current = value;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const pending = pendingRef.current;
        pendingRef.current = null;
        if (pending !== null) void send(pending);
      }, debounceMs);
    },
    [send, debounceMs]
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending !== null) void send(pending);
    };
  }, [send]);

  return { patch, status, error };
}

/**
 * Dirty-state tracking for explicit-save forms (text inputs, multi-field
 * forms). Compare-by-serialization keeps it dependency-free; forms here are
 * small. Call resetTo() when async initial data arrives, markClean() after
 * a successful save.
 */
export function useDirtyForm<T extends Record<string, unknown>>(initial: T) {
  const [values, setValues] = useState<T>(initial);
  const [baseline, setBaseline] = useState<T>(initial);

  const isDirty = JSON.stringify(values) !== JSON.stringify(baseline);

  const update = useCallback((patch: Partial<T>) => {
    setValues((prev) => ({ ...prev, ...patch }));
  }, []);

  const revert = useCallback(() => {
    setValues(baseline);
  }, [baseline]);

  const markClean = useCallback(() => {
    setBaseline(values);
  }, [values]);

  const resetTo = useCallback((next: T) => {
    setValues(next);
    setBaseline(next);
  }, []);

  return { values, setValues, update, isDirty, revert, markClean, resetTo };
}
