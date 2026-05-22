"use client";

/**
 * Public theme toggle.
 *
 * Anonymous visitors don't have an account-backed settings store, but the
 * pre-hydration THEME_SCRIPT already reads localStorage's "notes:settings"
 * key to apply the right .dark class on first paint. This toggle writes to
 * that same key + applies the class immediately for runtime changes.
 *
 * Three states: light / dark / system. Cycles through on click.
 *
 * Hide via settings (deferred work): when the author has disabled the
 * toggle on their published page in their settings, the parent shouldn't
 * render this component at all. For now it's always shown.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

type ThemePreference = "light" | "dark" | "system";

const SETTINGS_KEY = "notes:settings";
const ORDER: ThemePreference[] = ["light", "system", "dark"];

function readPreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return "system";
    const parsed = JSON.parse(raw) as { state?: { ui?: { theme?: string } } };
    const stored = parsed?.state?.ui?.theme;
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    // Fall through to default.
  }
  return "system";
}

function writePreference(pref: ThemePreference) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    const parsed = raw
      ? (JSON.parse(raw) as { state?: { ui?: Record<string, unknown> }; version?: number })
      : { state: { ui: {} }, version: 0 };
    if (!parsed.state) parsed.state = { ui: {} };
    if (!parsed.state.ui) parsed.state.ui = {};
    parsed.state.ui.theme = pref;
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(parsed));
  } catch {
    // Storage may be blocked (Safari ITP, etc.). Theme still applies via classList below.
  }
}

function applyClass(pref: ThemePreference) {
  if (typeof document === "undefined") return;
  const resolved =
    pref === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : pref;
  const root = document.documentElement;
  if (resolved === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
  root.setAttribute("data-theme", resolved);
  root.setAttribute("data-theme-pref", pref);
}

const LABELS: Record<ThemePreference, string> = {
  light: "Light",
  system: "System",
  dark: "Dark",
};

const ICONS: Record<ThemePreference, string> = {
  light: "☀",
  system: "◐",
  dark: "☾",
};

// Module-level subscription so the same handler doesn't duplicate per render.
function subscribePreference(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  // Storage events fire when ANOTHER tab writes to localStorage. Same-tab
  // writes are pushed via a custom "publictheme:change" event from cycle().
  window.addEventListener("storage", cb);
  window.addEventListener("publictheme:change", cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener("publictheme:change", cb);
  };
}

export function PublicThemeToggle() {
  // useSyncExternalStore is the React-recommended way to subscribe to
  // browser state (localStorage). It handles SSR via the third arg
  // (server snapshot) and avoids the "synchronous setState in effect"
  // pattern the React Compiler flags. The bump counter forces
  // re-reads on cycle() without the snapshot needing a stable cache.
  const [bump, setBump] = useState(0);
  const pref = useSyncExternalStore(
    subscribePreference,
    () => {
      void bump; // keep the snapshot tied to the bump counter
      return readPreference();
    },
    () => "system" as ThemePreference,
  );
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // When the user is in "system" mode, follow OS changes at runtime too.
  useEffect(() => {
    if (pref !== "system" || typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyClass("system");
    if (mq.addEventListener) mq.addEventListener("change", handler);
    else mq.addListener(handler);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", handler);
      else mq.removeListener(handler);
    };
  }, [pref]);

  const cycle = useCallback(() => {
    const current = readPreference();
    const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length] ?? "system";
    writePreference(next);
    applyClass(next);
    setBump((b) => b + 1);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("publictheme:change"));
    }
  }, []);

  // Hide until mounted — avoids a hydration flash where the button shows
  // "System" before localStorage is read.
  if (!mounted) return null;

  return (
    <button
      type="button"
      onClick={cycle}
      className="public-theme-toggle"
      aria-label={`Theme: ${LABELS[pref]}. Click to cycle.`}
      title={`Theme: ${LABELS[pref]} (click to cycle)`}
      data-theme-toggle-state={pref}
    >
      <span aria-hidden="true">{ICONS[pref]}</span>
      <span className="public-theme-toggle-label">{LABELS[pref]}</span>
    </button>
  );
}
