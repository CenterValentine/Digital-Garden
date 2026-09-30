/**
 * How a reader mark looks: a highlight (tinted background) or an underline,
 * in one of five colors — drawn per reader theme so both stay legible.
 *
 * The style rides in the annotation's `color` value ("yellow" = highlight,
 * "underline:yellow" = underline) so no schema change was needed; every
 * reader of `color` goes through `parseMark`.
 *
 * Why per-theme palettes: a bright translucent fill works under dark text on
 * paper (multiply keeps the ink black), but on a dark page the same fill
 * washes over the light text and dims it (the overlay sits above the text).
 * Dark pages get deep hues with `lighten` instead, and underlines flip the other way
 * (deep on paper, bright on dark) so the line always stands off the page.
 */

import { READER_HIGHLIGHT_COLORS, type ReaderHighlightColor } from "@/lib/domain/reader/types";

export type MarkStyle = "highlight" | "underline";
export type MarkTone = "light" | "dark";

const UNDERLINE_PREFIX = "underline:";

function isMarkColor(value: string): value is ReaderHighlightColor {
  return (READER_HIGHLIGHT_COLORS as readonly string[]).includes(value);
}

export function parseMark(value: string | null | undefined): { style: MarkStyle; color: ReaderHighlightColor } {
  const raw = value ?? "yellow";
  const style: MarkStyle = raw.startsWith(UNDERLINE_PREFIX) ? "underline" : "highlight";
  const name = style === "underline" ? raw.slice(UNDERLINE_PREFIX.length) : raw;
  return { style, color: isMarkColor(name) ? name : "yellow" };
}

export function markValue(style: MarkStyle, color: ReaderHighlightColor): string {
  return style === "underline" ? `${UNDERLINE_PREFIX}${color}` : color;
}

/** Highlight fills (drawn with `HIGHLIGHT_LAYER` opacity/blend) and underline strokes. */
const PALETTE: Record<MarkTone, Record<ReaderHighlightColor, { fill: string; line: string }>> = {
  light: {
    yellow: { fill: "#facc15", line: "#a16207" },
    green: { fill: "#4ade80", line: "#15803d" },
    blue: { fill: "#60a5fa", line: "#1d4ed8" },
    pink: { fill: "#f472b6", line: "#be185d" },
    purple: { fill: "#c084fc", line: "#7e22ce" },
  },
  dark: {
    yellow: { fill: "#6b4a0c", line: "#fde047" },
    green: { fill: "#14532d", line: "#86efac" },
    blue: { fill: "#1e3a8a", line: "#93c5fd" },
    pink: { fill: "#831843", line: "#f9a8d4" },
    purple: { fill: "#581c87", line: "#d8b4fe" },
  },
};

/** CSS custom properties foliate's highlight layer reads (set on the view). */
export const HIGHLIGHT_LAYER: Record<MarkTone, { opacity: string; blend: string }> = {
  light: { opacity: "0.45", blend: "multiply" },
  // `lighten` keeps the max channel: the dark page takes the fill, the light
  // text (brighter than every fill) stays exactly as it was.
  dark: { opacity: "1", blend: "lighten" },
};

export function markPaint(value: string | null | undefined, tone: MarkTone) {
  const { style, color } = parseMark(value);
  const colors = PALETTE[tone][color];
  return style === "underline"
    ? { style, color: colors.line }
    : { style, color: colors.fill };
}

/**
 * Chip colors for the app UI (toolbars, sidebar list) — mid tones readable on
 * both the app's light and dark surfaces.
 */
export const MARK_SWATCH: Record<ReaderHighlightColor, string> = {
  yellow: "#eab308",
  green: "#22c55e",
  blue: "#3b82f6",
  pink: "#ec4899",
  purple: "#a855f7",
};

/**
 * The same marks as inline styles, for readers that render their own HTML
 * (scriptures) rather than drawing on foliate's overlay. A span's background
 * sits under its text, so no blend is needed: the light fill is translucent
 * under dark ink, the dark fill opaque under light text.
 */
export function markInlineStyle(
  value: string | null | undefined,
  tone: MarkTone
): { backgroundColor?: string; textDecorationLine?: string; textDecorationColor?: string; textDecorationThickness?: string; textUnderlineOffset?: string } {
  const paint = markPaint(value, tone);
  if (paint.style === "underline") {
    return {
      textDecorationLine: "underline",
      textDecorationColor: paint.color,
      textDecorationThickness: "2px",
      textUnderlineOffset: "3px",
    };
  }
  return { backgroundColor: tone === "light" ? `${paint.color}73` : paint.color };
}
