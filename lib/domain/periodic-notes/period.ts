import moment, { type Moment } from "moment";
import type { PeriodicNoteKind, PeriodicNotePeriod } from "./types";
import { PERIODIC_NOTES_DEFAULTS } from "./settings";

export function getMomentForPeriodicNote(value?: string | null): Moment {
  if (!value) return moment();

  const parsed = moment(value);
  return parsed.isValid() ? parsed : moment();
}

export function getPeriodicNotePeriod(
  kind: PeriodicNoteKind,
  filenameFormat: string,
  value?: string | null
): PeriodicNotePeriod {
  const current = getMomentForPeriodicNote(value);
  const format = filenameFormat.trim() || PERIODIC_NOTES_DEFAULTS[kind].filenameFormat;

  return {
    kind,
    periodKey:
      kind === "weekly"
        ? current.clone().startOf("isoWeek").format("GGGG-[W]WW")
        : current.format("YYYY-MM-DD"),
    title: formatPeriodicNoteTitle(current, format, kind),
  };
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

export function getNextPeriodicRolloverDelay(now = new Date()) {
  const current = moment(now);
  const nextMidnight = current.clone().add(1, "day").startOf("day");
  return Math.max(1_000, nextMidnight.diff(current) + 1_000);
}
