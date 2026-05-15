"use client";

import { useEffect } from "react";
import { useResolvedTheme, useThemePreference } from "./useResolvedTheme";

/**
 * ThemeProvider — applies the resolved theme to <html> on every change.
 *
 * The pre-hydration script in `THEME_SCRIPT` handles the initial paint;
 * this provider keeps the class in sync afterwards as:
 *   - the user changes their preference,
 *   - the backend `SettingsInitializer` fetches a different preference,
 *   - the OS color-scheme flips (only relevant when preference === "system").
 *
 * Does not render its own element — children pass through untouched.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const resolved = useResolvedTheme();
  const preference = useThemePreference();

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (resolved === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    root.setAttribute("data-theme", resolved);
    root.setAttribute("data-theme-pref", preference);
  }, [resolved, preference]);

  return <>{children}</>;
}
