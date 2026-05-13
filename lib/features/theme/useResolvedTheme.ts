"use client";

import { useEffect, useState } from "react";
import { useSettingsStore } from "@/state/settings-store";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const SYSTEM_DARK_QUERY = "(prefers-color-scheme: dark)";

function readSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  try {
    return window.matchMedia(SYSTEM_DARK_QUERY).matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function useThemePreference(): ThemePreference {
  return useSettingsStore((s) => (s.ui?.theme as ThemePreference) ?? "system");
}

/**
 * Canonical "what theme is actually showing right now" accessor.
 *
 * Collapses the user's preference ("light" | "dark" | "system") into a
 * concrete "light" | "dark". When the preference is "system", it tracks the
 * OS via matchMedia and re-renders on change.
 *
 * Use this in any component that needs to make a theme-aware decision
 * (e.g., a third-party viewer that takes a theme prop).
 */
export function useResolvedTheme(): ResolvedTheme {
  const preference = useThemePreference();
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() =>
    readSystemTheme()
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(SYSTEM_DARK_QUERY);
    const handler = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? "dark" : "light");
    };
    if (mq.addEventListener) mq.addEventListener("change", handler);
    else mq.addListener(handler);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", handler);
      else mq.removeListener(handler);
    };
  }, []);

  return preference === "system" ? systemTheme : preference;
}
