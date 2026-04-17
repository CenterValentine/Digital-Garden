export type PeriodicSummaryKind = "daily" | "weekly";

export interface PeriodicSummaryWindow {
  periodDate: string;
  startIso: string;
  endIso: string;
  label: string;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function formatLocalDate(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function parseLocalDate(value: string) {
  const match = value.match(DATE_RE);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

export function clampSummaryCutoffHour(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(4, Math.max(0, Math.trunc(parsed)));
}

function getAdjustedWorkDate(now: Date, cutoffHour: number) {
  const adjusted = new Date(now);
  adjusted.setHours(adjusted.getHours() - clampSummaryCutoffHour(cutoffHour));
  return adjusted;
}

export function getIsoWeekStartLocalDate(value: string) {
  const date = parseLocalDate(value) ?? getAdjustedWorkDate(new Date(), 0);
  const dayIndex = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - dayIndex);
  return formatLocalDate(date);
}

export function getDefaultPeriodicSummaryDate(
  kind: PeriodicSummaryKind,
  now = new Date(),
  cutoffHour = 0
) {
  const adjusted = getAdjustedWorkDate(now, cutoffHour);
  const date = formatLocalDate(adjusted);
  return kind === "weekly" ? getIsoWeekStartLocalDate(date) : date;
}

export function getPeriodicSummaryWindow(
  kind: PeriodicSummaryKind,
  periodDate: string,
  cutoffHour: unknown
): PeriodicSummaryWindow {
  const cutoff = clampSummaryCutoffHour(cutoffHour);
  const safeDate =
    kind === "weekly"
      ? getIsoWeekStartLocalDate(periodDate)
      : formatLocalDate(parseLocalDate(periodDate) ?? getAdjustedWorkDate(new Date(), cutoff));
  const startDate = parseLocalDate(safeDate) ?? getAdjustedWorkDate(new Date(), cutoff);
  const start = new Date(
    startDate.getFullYear(),
    startDate.getMonth(),
    startDate.getDate(),
    cutoff,
    0,
    0,
    0
  );
  const end = new Date(start);
  end.setDate(end.getDate() + (kind === "weekly" ? 7 : 1));

  return {
    periodDate: safeDate,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    label: kind === "weekly" ? `Week of ${safeDate}` : safeDate,
  };
}
