"use client";

/**
 * PersonalThemeToggle — the Day/Night pill used on the standalone personal
 * pages (About / Results / Résumé). Flips `html[data-theme]`, the same axis the
 * garden shell and the IDE theme system drive, and persists to localStorage so
 * the choice carries between personal routes.
 *
 * The pressed state is derived directly from the DOM attribute via
 * `useSyncExternalStore` (subscribing to a MutationObserver) rather than mirrored
 * into component state in an effect — this keeps the read SSR-safe and avoids the
 * React Compiler's "setState synchronously within an effect" cascade.
 */

import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

function getTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";
}

export function PersonalThemeToggle() {
  // Server snapshot is "light"; the real value resolves on the client from the
  // attribute the root THEME_SCRIPT set pre-paint.
  const theme = useSyncExternalStore(subscribe, getTheme, () => "light");

  const setTheme = (t: Theme) => {
    document.documentElement.setAttribute("data-theme", t); // triggers subscribe()
    try {
      localStorage.setItem("dv-theme", t);
    } catch {
      // localStorage unavailable (private mode) — non-fatal
    }
  };

  return (
    <div className="toggle">
      <button
        type="button"
        aria-pressed={theme === "light"}
        onClick={() => setTheme("light")}
      >
        <span className="ic">☀</span> Day
      </button>
      <button
        type="button"
        aria-pressed={theme === "dark"}
        onClick={() => setTheme("dark")}
      >
        <span className="ic">◑</span> Night
      </button>
    </div>
  );
}
