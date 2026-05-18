"use client";

import { useEffect, useRef } from "react";
import { useSettingsStore } from "@/state/settings-store";
import { clientLogger } from "@/lib/core/logger/client";

/**
 * Settings Initializer
 *
 * Fetches user settings from backend on mount.
 * Should be mounted once in root layout.
 */
export function SettingsInitializer() {
  const fetchFromBackend = useSettingsStore((state) => state.fetchFromBackend);
  const hasInitialized = useRef(false);

  useEffect(() => {
    // Only fetch once per session
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      fetchFromBackend().catch((error) => {
        clientLogger.error({
          layer: "store",
          event: "settings_initial_load:caught",
          summary: "initial settings fetch failed (will use defaults)",
          error,
        });
        // Silent fail - defaults will be used
      });
    }
  }, [fetchFromBackend]);

  // No UI - just initialization logic
  return null;
}
