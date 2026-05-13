/**
 * Pre-hydration theme script.
 *
 * Injected as an inline <script> in the root <head>. Runs synchronously during
 * HTML parsing, BEFORE React hydrates, so .dark is applied to <html> before
 * the browser paints — preventing the white-flash FOUC on dark-mode reloads.
 *
 * Source of truth: zustand-persist cache at localStorage["notes:settings"]
 * (shape: { state: { ui: { theme: "light" | "dark" | "system" } }, version }).
 * If absent or malformed, falls back to OS pref via matchMedia. Defaults to
 * "light" if everything fails.
 *
 * The runtime ThemeProvider re-applies the class on hydration, so any drift
 * between cached and backend-stored preference is reconciled on first paint
 * after settings sync.
 */
export const THEME_SCRIPT = `
(function () {
  try {
    var theme = "system";
    try {
      var raw = window.localStorage.getItem("notes:settings");
      if (raw) {
        var parsed = JSON.parse(raw);
        var stored = parsed && parsed.state && parsed.state.ui && parsed.state.ui.theme;
        if (stored === "light" || stored === "dark" || stored === "system") {
          theme = stored;
        }
      }
    } catch (_) {}

    var resolved = theme;
    if (theme === "system") {
      try {
        resolved = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      } catch (_) {
        resolved = "light";
      }
    }

    var root = document.documentElement;
    if (resolved === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    root.setAttribute("data-theme", resolved);
    root.setAttribute("data-theme-pref", theme);
  } catch (_) {
    // Fail open — render in light mode.
  }
})();
`;
