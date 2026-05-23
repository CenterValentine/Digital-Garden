"use client";

// Hydrates non-critical persisted zustand stores after first paint.
//
// Six stores opt out of the default-synchronous hydration by setting
// `skipHydration: true` in their persist config. Without those stores
// flowing through the synchronous JSON.parse+set path on first render,
// initial mount is faster:
//   - One sync localStorage read per store avoided (~0.5-2ms each).
//   - One JSON.parse per store avoided (~0.5-3ms each depending on size).
//   - Subscriber re-renders during the hydration storm are avoided.
//
// All deferred stores are ones whose initial-default state is fine for
// first paint (modal closed, navigation history empty, timestamp format
// at the default, etc.). Real values load briefly after FCP and any
// subscribers re-render — no visible flash on the load-bearing surfaces.
//
// requestIdleCallback puts the work in idle time when possible; the
// 800ms timeout ensures we don't wait forever on a busy main thread.
// setTimeout fallback covers Safari (still no rIC in 2026).

import { useEffect } from "react";
import { useExtensionsUiStore } from "@/state/extensions-ui-store";
import { useNavigationHistoryStore } from "@/state/navigation-history-store";
import { useNotesPanelStore } from "@/state/notes-panel-store";
import { useRightSidebarStateStore } from "@/state/right-sidebar-state-store";
import { useTimestampFormatStore } from "@/state/timestamp-format-store";
import { useUploadSettingsStore } from "@/state/upload-settings-store";

const deferredStores = [
  useExtensionsUiStore,
  useNavigationHistoryStore,
  useNotesPanelStore,
  useRightSidebarStateStore,
  useTimestampFormatStore,
  useUploadSettingsStore,
] as const;

let didHydrate = false;

function hydrateDeferredStores() {
  if (didHydrate) return;
  didHydrate = true;
  // Each rehydrate() is independent — fire them all without awaiting so
  // a slow JSON.parse on one doesn't gate the rest. Persist middleware
  // handles internal subscription re-renders.
  for (const store of deferredStores) {
    try {
      void store.persist.rehydrate();
    } catch {
      // Hydration failures (corrupted localStorage, schema-version
      // migration error, etc.) leave the store at default state. The
      // user keeps a working app; the next interaction either saves a
      // fresh entry or fails gracefully.
    }
  }
}

export function DeferredStoreHydrator() {
  useEffect(() => {
    const win = window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    let handle: number | null = null;
    if (typeof win.requestIdleCallback === "function") {
      handle = win.requestIdleCallback(hydrateDeferredStores, { timeout: 800 });
    } else {
      // Safari fallback — small delay so we don't compete with hydration.
      handle = window.setTimeout(hydrateDeferredStores, 200) as unknown as number;
    }
    return () => {
      if (handle === null) return;
      if (typeof win.cancelIdleCallback === "function") {
        win.cancelIdleCallback(handle);
      } else {
        window.clearTimeout(handle);
      }
    };
  }, []);
  return null;
}
