import type { SpeedReaderFont, SpeedReaderOrpColor, SpeedReaderTheme } from "../state/speed-reader-store";

export const FONT_STACKS: Record<SpeedReaderFont, string> = {
  system:
    'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  atkinson: '"Atkinson Hyperlegible", system-ui, sans-serif',
  lexend: '"Lexend", system-ui, sans-serif',
  "open-dyslexic": '"OpenDyslexic", system-ui, sans-serif',
};

export const FONT_LABELS: Record<SpeedReaderFont, string> = {
  system: "System",
  atkinson: "Atkinson Hyperlegible",
  lexend: "Lexend",
  "open-dyslexic": "OpenDyslexic",
};

export interface ResolvedTheme {
  background: string;
  surface: string;
  textPrimary: string;
  textMuted: string;
  /** ORP letter highlight — red or blue per user preference. */
  orpAccent: string;
  /** UI affordance color (buttons, sliders, toggles) — gold-primary token. */
  controlAccent: string;
  controlBg: string;
  controlBorder: string;
}

// Gold-primary (#C9A86C) is the app's signature accent. It reads well against
// all speed-reader backgrounds and is distinct from the red/blue ORP options.
const GOLD = "#C9A86C";
// Slightly lighter gold for dark/OLED so it pops against near-black backgrounds.
const GOLD_DARK = "#D9B87E";

const LIGHT: ResolvedTheme = {
  background: "#fafafa",
  surface: "rgba(255, 255, 255, 0.7)",
  textPrimary: "#0a0a0a",
  textMuted: "#525252",
  orpAccent: "#dc2626",
  controlAccent: GOLD,
  controlBg: "rgba(0, 0, 0, 0.04)",
  controlBorder: "rgba(0, 0, 0, 0.08)",
};

const DARK: ResolvedTheme = {
  background: "#0f1115",
  surface: "rgba(20, 24, 32, 0.72)",
  textPrimary: "#f5f5f5",
  textMuted: "#a3a3a3",
  orpAccent: "#f87171",
  controlAccent: GOLD_DARK,
  controlBg: "rgba(255, 255, 255, 0.06)",
  controlBorder: "rgba(255, 255, 255, 0.1)",
};

const SEPIA: ResolvedTheme = {
  background: "#f5ecd9",
  surface: "rgba(253, 246, 227, 0.75)",
  textPrimary: "#3a2f1d",
  textMuted: "#7a6a4d",
  orpAccent: "#b1432a",
  controlAccent: GOLD,
  controlBg: "rgba(58, 47, 29, 0.06)",
  controlBorder: "rgba(58, 47, 29, 0.14)",
};

const OLED: ResolvedTheme = {
  background: "#000000",
  surface: "rgba(8, 8, 8, 0.85)",
  textPrimary: "#e5e5e5",
  textMuted: "#737373",
  orpAccent: "#ef4444",
  controlAccent: GOLD_DARK,
  controlBg: "rgba(255, 255, 255, 0.04)",
  controlBorder: "rgba(255, 255, 255, 0.08)",
};

const BLUE_ORP = "#2563EB";

export function resolveTheme(
  theme: SpeedReaderTheme,
  prefersDark: boolean,
  orpColor: SpeedReaderOrpColor = "red"
): ResolvedTheme {
  let base: ResolvedTheme;
  switch (theme) {
    case "light":
      base = LIGHT;
      break;
    case "dark":
      base = DARK;
      break;
    case "sepia":
      base = SEPIA;
      break;
    case "oled":
      base = OLED;
      break;
    case "system":
    default:
      base = prefersDark ? DARK : LIGHT;
  }
  return orpColor === "blue" ? { ...base, orpAccent: BLUE_ORP } : base;
}

let fontsLoaded = false;
/**
 * Lazily inject Google Fonts the first time the reader opens.
 * Subsequent opens reuse the cached stylesheet.
 */
export function ensureReaderFontsLoaded(): void {
  if (fontsLoaded || typeof document === "undefined") return;
  fontsLoaded = true;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Lexend:wght@400;700&display=swap";
  document.head.appendChild(link);

  // OpenDyslexic is not on Google Fonts; load from a CDN.
  const odLink = document.createElement("link");
  odLink.rel = "stylesheet";
  odLink.href =
    "https://cdn.jsdelivr.net/npm/open-dyslexic@1.0.3/open-dyslexic-regular.css";
  document.head.appendChild(odLink);
}
