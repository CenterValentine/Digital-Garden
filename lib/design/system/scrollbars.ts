/**
 * Scrollbar Tokens — Liquid Glass
 *
 * Thin, theme-aware scrollbars applied globally via CSS variables.
 *
 * Theme handling mirrors surfaces.ts: the values below are documentation
 * for non-CSS consumers. The actual CSS variables that the browser reads
 * live in app/globals.css under `:root` (light) and `.dark` (dark).
 *
 * The optional fade-on-idle behavior is opt-in per surface via the
 * `useFadeScrollbar` hook (see components/scroll/useFadeScrollbar.ts).
 * Unwrapped surfaces still get the static themed thumb — they just don't
 * fade away when idle.
 */

export const scrollbarsLight = {
  thumb: "rgba(70, 94, 115, 0.28)",
  thumbHover: "rgba(70, 94, 115, 0.5)",
  thumbActive: "rgba(70, 94, 115, 0.65)",
  track: "transparent",
  size: "8px",
  radius: "999px",
} as const;

export const scrollbarsDark = {
  thumb: "rgba(229, 212, 176, 0.22)",
  thumbHover: "rgba(229, 212, 176, 0.42)",
  thumbActive: "rgba(229, 212, 176, 0.58)",
  track: "transparent",
  size: "8px",
  radius: "999px",
} as const;

export type ScrollbarTokens = typeof scrollbarsLight;

/**
 * Returns CSS-variable references for use in inline styles or styled
 * components. The browser resolves these per theme via the `.dark` cascade.
 */
export function getScrollbarStyles() {
  return {
    scrollbarWidth: "thin" as const,
    scrollbarColor: "var(--scrollbar-thumb) var(--scrollbar-track)",
  };
}
