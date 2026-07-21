import moment, { type Moment } from "moment";
import type { PeriodicNoteKind, PeriodicNotePeriod } from "./types";
import { PERIODIC_NOTES_DEFAULTS } from "./settings";

export function getMomentForPeriodicNote(value?: string | null, nightOwlHour = 0): Moment {
  const base = (() => {
    if (!value) return moment();
    const parsed = moment(value);
    return parsed.isValid() ? parsed : moment();
  })();
  const clampedHour = Math.min(4, Math.max(0, Math.trunc(nightOwlHour)));
  return clampedHour > 0 ? base.clone().subtract(clampedHour, "hours") : base;
}

export function getPeriodicNotePeriod(
  kind: PeriodicNoteKind,
  filenameFormat: string,
  value?: string | null,
  nightOwlHour = 0
): PeriodicNotePeriod {
  const current = getMomentForPeriodicNote(value, nightOwlHour);
  const format = filenameFormat.trim() || PERIODIC_NOTES_DEFAULTS[kind].filenameFormat;

  return {
    kind,
    periodKey: formatPeriodKey(kind, current),
    title: formatPeriodicNoteTitle(current, format, kind),
  };
}

/**
 * Canonical period key per kind. All four formats sort lexicographically
 * identically to chronologically, which is what lets the neighbor/glide range
 * queries and the auto-create dedup index work without date parsing.
 */
export function formatPeriodKey(kind: PeriodicNoteKind, current: Moment): string {
  switch (kind) {
    case "weekly":
      return current.clone().startOf("isoWeek").format("GGGG-[W]WW");
    case "monthly":
      return current.format("YYYY-MM");
    case "quarterly":
      return current.format("YYYY-[Q]Q");
    case "yearly":
      return current.format("YYYY");
    default:
      return current.format("YYYY-MM-DD");
  }
}

export function formatPeriodicNoteTitle(
  current: Moment,
  filenameFormat: string,
  kind: PeriodicNoteKind
) {
  const fallbackFormat = PERIODIC_NOTES_DEFAULTS[kind].filenameFormat;
  const format = filenameFormat.trim() || fallbackFormat;
  const title = current.format(format).trim();

  if (title) return title;
  return current.format(fallbackFormat);
}

export function getNextPeriodicRolloverDelay(now = new Date(), nightOwlHour = 0) {
  const clampedHour = Math.min(4, Math.max(0, Math.trunc(nightOwlHour)));
  // The "day" flips at midnight + nightOwlHour real-clock hours, not at midnight.
  const current = moment(now);
  const nextRollover = current.clone().add(1, "day").startOf("day").add(clampedHour, "hours");
  return Math.max(1_000, nextRollover.diff(current) + 1_000);
}
