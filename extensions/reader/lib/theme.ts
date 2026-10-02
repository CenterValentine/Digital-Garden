import type { ReaderTheme } from "../state/reader-store";
import type { MarkTone } from "./marks";

/** Page colors per reader theme (books and scriptures alike). */
export const THEME_COLORS: Record<Exclude<ReaderTheme, "system">, { bg: string; fg: string; link: string }> = {
  light: { bg: "#ffffff", fg: "#1f2328", link: "#0b62d6" },
  sepia: { bg: "#f4ecd8", fg: "#3b2f1e", link: "#8a4b0f" },
  dark: { bg: "#16181d", fg: "#d8dce3", link: "#8ab4ff" },
};

export function resolveTheme(theme: ReaderTheme): Exclude<ReaderTheme, "system"> {
  if (theme !== "system") return theme;
  if (typeof document !== "undefined" && document.documentElement.classList.contains("dark")) {
    return "dark";
  }
  return "light";
}

export function themeTone(theme: ReaderTheme): MarkTone {
  return resolveTheme(theme) === "dark" ? "dark" : "light";
}
