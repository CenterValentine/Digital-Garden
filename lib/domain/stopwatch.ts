export type StopwatchStyleVariant = "ios" | "minimal" | "panel";

export interface StopwatchLap {
  id: string;
  splitMs: number;
  lapMs: number;
  capturedAt: string;
}

export interface StopwatchAttrs {
  blockId: string;
  blockType: "stopwatch";
  title: string;
  styleVariant: StopwatchStyleVariant;
  accentColor: string;
  showLaps: boolean;
  showBackground: boolean;
  showBorder: boolean;
  running: boolean;
  startedAt: string | null;
  accumulatedMs: number;
  laps: StopwatchLap[];
}

export interface StopwatchDisplayPart {
  unit: "years" | "months" | "days" | "hours" | "minutes" | "seconds" | "milliseconds";
  label: string;
  value: number;
  text: string;
}

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const MS_PER_MONTH = 30 * MS_PER_DAY;
const MS_PER_YEAR = 365 * MS_PER_DAY;

export const DEFAULT_STOPWATCH_COLOR = "#ff6b57";

export function nowIsoTimestamp(): string {
  return new Date().toISOString();
}

export function createDefaultStopwatchAttrs(): StopwatchAttrs {
  return {
    blockId: crypto.randomUUID(),
    blockType: "stopwatch",
    title: "Stopwatch",
    styleVariant: "ios",
    accentColor: DEFAULT_STOPWATCH_COLOR,
    showLaps: true,
    showBackground: true,
    showBorder: true,
    running: false,
    startedAt: null,
    accumulatedMs: 0,
    laps: [],
  };
}

export function normalizeStopwatchAttrs(
  rawAttrs: Partial<StopwatchAttrs> & Record<string, unknown>
): StopwatchAttrs {
  const fallback = createDefaultStopwatchAttrs();

  const laps = Array.isArray(rawAttrs.laps)
    ? rawAttrs.laps
        .map((lap, index) => {
          if (!lap || typeof lap !== "object") return null;
          const current = lap as Partial<StopwatchLap>;
          const splitMs =
            typeof current.splitMs === "number" && Number.isFinite(current.splitMs)
              ? Math.max(0, Math.floor(current.splitMs))
              : 0;
          const lapMs =
            typeof current.lapMs === "number" && Number.isFinite(current.lapMs)
              ? Math.max(0, Math.floor(current.lapMs))
              : splitMs;
          return {
            id:
              typeof current.id === "string" && current.id.length > 0
                ? current.id
                : `lap-${index + 1}`,
            splitMs,
            lapMs,
            capturedAt:
              typeof current.capturedAt === "string" && current.capturedAt.length > 0
                ? current.capturedAt
                : nowIsoTimestamp(),
          } satisfies StopwatchLap;
        })
        .filter((lap): lap is StopwatchLap => lap !== null)
    : [];

  return {
    blockId:
      typeof rawAttrs.blockId === "string" && rawAttrs.blockId.length > 0
        ? rawAttrs.blockId
        : fallback.blockId,
    blockType: "stopwatch",
    title:
      typeof rawAttrs.title === "string" && rawAttrs.title.trim().length > 0
        ? rawAttrs.title
        : fallback.title,
    styleVariant:
      rawAttrs.styleVariant === "minimal" || rawAttrs.styleVariant === "panel"
        ? rawAttrs.styleVariant
        : fallback.styleVariant,
    accentColor:
      typeof rawAttrs.accentColor === "string" && rawAttrs.accentColor.length > 0
        ? rawAttrs.accentColor
        : fallback.accentColor,
    showLaps: rawAttrs.showLaps !== false,
    showBackground: rawAttrs.showBackground !== false,
    showBorder: rawAttrs.showBorder !== false,
    running: rawAttrs.running === true,
    startedAt:
      typeof rawAttrs.startedAt === "string" && rawAttrs.startedAt.length > 0
        ? rawAttrs.startedAt
        : null,
    accumulatedMs:
      typeof rawAttrs.accumulatedMs === "number" && Number.isFinite(rawAttrs.accumulatedMs)
        ? Math.max(0, Math.floor(rawAttrs.accumulatedMs))
        : 0,
    laps,
  };
}

function getTimestampMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getStopwatchElapsedMs(
  attrs: StopwatchAttrs,
  nowMs = Date.now()
): number {
  const startedAtMs = getTimestampMs(attrs.startedAt);
  if (!attrs.running || startedAtMs == null) {
    return Math.max(0, attrs.accumulatedMs);
  }

  return Math.max(0, attrs.accumulatedMs + Math.max(0, nowMs - startedAtMs));
}

export function startStopwatch(
  attrs: StopwatchAttrs,
  startedAt = nowIsoTimestamp()
): StopwatchAttrs {
  if (attrs.running) return attrs;
  return {
    ...attrs,
    running: true,
    startedAt,
  };
}

export function stopStopwatch(
  attrs: StopwatchAttrs,
  stoppedAt = nowIsoTimestamp()
): StopwatchAttrs {
  if (!attrs.running) return attrs;
  const nextElapsed = getStopwatchElapsedMs(attrs, getTimestampMs(stoppedAt) ?? Date.now());
  return {
    ...attrs,
    running: false,
    startedAt: null,
    accumulatedMs: nextElapsed,
  };
}

export function resetStopwatch(attrs: StopwatchAttrs): StopwatchAttrs {
  return {
    ...attrs,
    running: false,
    startedAt: null,
    accumulatedMs: 0,
    laps: [],
  };
}

export function addStopwatchLap(
  attrs: StopwatchAttrs,
  capturedAt = nowIsoTimestamp()
): StopwatchAttrs {
  if (!attrs.running) return attrs;
  const splitMs = getStopwatchElapsedMs(attrs, getTimestampMs(capturedAt) ?? Date.now());
  const lastSplitMs = attrs.laps[attrs.laps.length - 1]?.splitMs ?? 0;
  return {
    ...attrs,
    laps: [
      ...attrs.laps,
      {
        id: crypto.randomUUID(),
        splitMs,
        lapMs: Math.max(0, splitMs - lastSplitMs),
        capturedAt,
      },
    ],
  };
}

export function getStopwatchDisplayParts(totalMs: number): StopwatchDisplayPart[] {
  let remaining = Math.max(0, Math.floor(totalMs));

  const years = Math.floor(remaining / MS_PER_YEAR);
  remaining -= years * MS_PER_YEAR;

  const months = Math.floor(remaining / MS_PER_MONTH);
  remaining -= months * MS_PER_MONTH;

  const days = Math.floor(remaining / MS_PER_DAY);
  remaining -= days * MS_PER_DAY;

  const hours = Math.floor(remaining / MS_PER_HOUR);
  remaining -= hours * MS_PER_HOUR;

  const minutes = Math.floor(remaining / MS_PER_MINUTE);
  remaining -= minutes * MS_PER_MINUTE;

  const seconds = Math.floor(remaining / MS_PER_SECOND);
  remaining -= seconds * MS_PER_SECOND;

  const milliseconds = remaining;

  const rawParts: StopwatchDisplayPart[] = [
    { unit: "years", label: "yr", value: years, text: String(years) },
    { unit: "months", label: "mo", value: months, text: String(months) },
    { unit: "days", label: "day", value: days, text: String(days) },
    { unit: "hours", label: "hr", value: hours, text: String(hours).padStart(2, "0") },
    { unit: "minutes", label: "min", value: minutes, text: String(minutes).padStart(2, "0") },
    { unit: "seconds", label: "sec", value: seconds, text: String(seconds).padStart(2, "0") },
    {
      unit: "milliseconds",
      label: "ms",
      value: milliseconds,
      text: String(milliseconds).padStart(3, "0"),
    },
  ];

  const firstVisibleIndex = rawParts.findIndex(
    (part) => part.value > 0 && part.unit !== "milliseconds"
  );
  const startIndex = firstVisibleIndex === -1 ? 5 : Math.min(firstVisibleIndex, 5);

  return rawParts.slice(startIndex);
}

export function formatStopwatchPlainText(totalMs: number): string {
  return getStopwatchDisplayParts(totalMs)
    .map((part) => part.text)
    .join(":");
}

export function getStopwatchLapRows(attrs: StopwatchAttrs, nowMs = Date.now()) {
  const laps = attrs.laps.map((lap, index) => ({
    ...lap,
    number: index + 1,
    splitText: formatStopwatchPlainText(lap.splitMs),
    lapText: formatStopwatchPlainText(lap.lapMs),
  }));

  const currentElapsed = getStopwatchElapsedMs(attrs, nowMs);
  const currentLapMs = Math.max(0, currentElapsed - (attrs.laps[attrs.laps.length - 1]?.splitMs ?? 0));

  return {
    laps,
    currentLapText: formatStopwatchPlainText(currentLapMs),
    totalText: formatStopwatchPlainText(currentElapsed),
  };
}
