export type HabitTrackerPreset = "monthly-grid" | "weekly-grid" | "streak-cards";
export type HabitValueMode = "boolean" | "count" | "status";
export type HabitWeekStartsOn = "sunday" | "monday";
export type HabitStatusValue = "checked" | "missed" | "thinking";
export type HabitIntervalEntryMode = "single" | "split";

export interface HabitIntervalDefinition {
  id: string;
  startMinute: number;
  endMinute: number;
}

export interface HabitDefinition {
  id: string;
  name: string;
  icon: string;
  statusIcon: string;
  color: string;
  valueMode: HabitValueMode;
  intervalMode: HabitIntervalEntryMode;
  showIntervalTimes: boolean;
  intervals: HabitIntervalDefinition[];
  target: number;
  unit: string;
}

export type HabitTrackerEntryValue = boolean | number | HabitStatusValue;
export type HabitTrackerEntries = Record<string, Record<string, HabitTrackerEntryValue>>;

export interface HabitTrackerAttrs {
  blockId: string;
  blockType: "habitTracker";
  preset: HabitTrackerPreset;
  title: string;
  anchorDate: string;
  weekStartsOn: HabitWeekStartsOn;
  showStats: boolean;
  showBackground: boolean;
  showBorder: boolean;
  habits: HabitDefinition[];
  entries: HabitTrackerEntries;
}

export interface HabitTrackerVisibleRange {
  preset: HabitTrackerPreset;
  label: string;
  dates: string[];
}

export interface HabitCompletionStats {
  hitDays: number;
  totalDays: number;
  completionRate: number;
  currentStreak: number;
}

const DEFAULT_HABIT_COLORS = [
  "#22c55e",
  "#3b82f6",
  "#f59e0b",
  "#ef4444",
  "#a855f7",
  "#14b8a6",
];

export const DEFAULT_HABIT_ICON = "lucide:SquareCheck";
export const DEFAULT_STATUS_ICON = "lucide:Cloud";
export const DEFAULT_HABIT_COLOR = DEFAULT_HABIT_COLORS[0];
const MINUTES_PER_DAY = 24 * 60;
const MINUTES_PER_INTERVAL_STEP = 30;
const FULL_DAY_INTERVAL_ID = "interval-1";

const DAY_MS = 24 * 60 * 60 * 1000;

export function todayIso(): string {
  return formatIsoDate(new Date());
}

export function createDefaultHabit(index: number): HabitDefinition {
  return {
    id: crypto.randomUUID(),
    name: `Habit ${index + 1}`,
    icon: DEFAULT_HABIT_ICON,
    statusIcon: DEFAULT_STATUS_ICON,
    color: DEFAULT_HABIT_COLORS[index % DEFAULT_HABIT_COLORS.length],
    valueMode: "boolean",
    intervalMode: "single",
    showIntervalTimes: true,
    intervals: createEvenHabitIntervals(1),
    target: 1,
    unit: "",
  };
}

export function createEvenHabitIntervals(count: number): HabitIntervalDefinition[] {
  const normalizedCount = Math.max(1, Math.min(8, Math.floor(count || 1)));
  const sliceSize = MINUTES_PER_DAY / normalizedCount;

  return Array.from({ length: normalizedCount }, (_, index) => {
    const startMinute = Math.round((sliceSize * index) / MINUTES_PER_INTERVAL_STEP) * MINUTES_PER_INTERVAL_STEP;
    const endMinute =
      index === normalizedCount - 1
        ? MINUTES_PER_DAY
        : Math.round((sliceSize * (index + 1)) / MINUTES_PER_INTERVAL_STEP) *
          MINUTES_PER_INTERVAL_STEP;
    return {
      id: `interval-${index + 1}`,
      startMinute,
      endMinute,
    };
  });
}

export function clampIntervalMinute(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(
    0,
    Math.min(
      MINUTES_PER_DAY,
      Math.round(value / MINUTES_PER_INTERVAL_STEP) * MINUTES_PER_INTERVAL_STEP
    )
  );
}

function normalizeIntervalDefinition(
  rawInterval: Partial<HabitIntervalDefinition> | undefined,
  index: number,
  fallback: HabitIntervalDefinition
): HabitIntervalDefinition {
  const startMinute = clampIntervalMinute(rawInterval?.startMinute ?? fallback.startMinute);
  const rawEndMinute = clampIntervalMinute(rawInterval?.endMinute ?? fallback.endMinute);
  const endMinute = Math.max(
    startMinute + MINUTES_PER_INTERVAL_STEP,
    Math.min(MINUTES_PER_DAY, rawEndMinute || fallback.endMinute)
  );

  return {
    id:
      typeof rawInterval?.id === "string" && rawInterval.id.length > 0
        ? rawInterval.id
        : `interval-${index + 1}`,
    startMinute,
    endMinute,
  };
}

export function normalizeHabitIntervals(
  rawIntervals: unknown,
  fallbackCount = 1
): HabitIntervalDefinition[] {
  const fallback = createEvenHabitIntervals(fallbackCount);
  if (!Array.isArray(rawIntervals) || rawIntervals.length === 0) {
    return fallback;
  }

  return rawIntervals.map((rawInterval, index) =>
    normalizeIntervalDefinition(
      rawInterval && typeof rawInterval === "object"
        ? (rawInterval as Partial<HabitIntervalDefinition>)
        : undefined,
      index,
      fallback[index] || fallback[fallback.length - 1]
    )
  );
}

export function getStoredHabitIntervals(habit: HabitDefinition): HabitIntervalDefinition[] {
  return normalizeHabitIntervals(habit.intervals, habit.intervals?.length || 1);
}

export function getRenderableHabitIntervals(habit: HabitDefinition): HabitIntervalDefinition[] {
  if (habit.intervalMode !== "split") {
    return [];
  }
  return getStoredHabitIntervals(habit);
}

export function normalizeHabitTrackerAttrs(
  rawAttrs: Partial<HabitTrackerAttrs> & Record<string, unknown>
): HabitTrackerAttrs {
  const habits = Array.isArray(rawAttrs.habits)
    ? rawAttrs.habits.map((rawHabit, index) => {
        if (!rawHabit || typeof rawHabit !== "object") {
          return createDefaultHabit(index);
        }

        const fallback = createDefaultHabit(index);
        const habit = rawHabit as Partial<HabitDefinition>;
        return {
          id:
            typeof habit.id === "string" && habit.id.length > 0
              ? habit.id
              : fallback.id,
          name:
            typeof habit.name === "string" && habit.name.length > 0
              ? habit.name
              : fallback.name,
          icon:
            typeof habit.icon === "string" && habit.icon.length > 0 && habit.icon !== "•"
              ? habit.icon
              : fallback.icon,
          statusIcon:
            typeof habit.statusIcon === "string" ? habit.statusIcon : fallback.statusIcon,
          color: typeof habit.color === "string" ? habit.color : fallback.color,
          valueMode:
            habit.valueMode === "count"
              ? ("count" as HabitValueMode)
              : habit.valueMode === "status"
                ? ("status" as HabitValueMode)
              : ("boolean" as HabitValueMode),
          intervalMode:
            habit.intervalMode === "split"
              ? ("split" as HabitIntervalEntryMode)
              : ("single" as HabitIntervalEntryMode),
          showIntervalTimes: habit.showIntervalTimes !== false,
          intervals: normalizeHabitIntervals(habit.intervals, fallback.intervals.length),
          target:
            typeof habit.target === "number" && Number.isFinite(habit.target)
              ? Math.max(1, Math.floor(habit.target))
              : fallback.target,
          unit: typeof habit.unit === "string" ? habit.unit : fallback.unit,
        };
      })
    : [];

  const entries: HabitTrackerEntries = {};
  if (rawAttrs.entries && typeof rawAttrs.entries === "object") {
    for (const [habitId, rawEntryMap] of Object.entries(rawAttrs.entries)) {
      if (!rawEntryMap || typeof rawEntryMap !== "object") continue;
      const nextEntryMap: Record<string, HabitTrackerEntryValue> = {};
      for (const [isoDate, rawValue] of Object.entries(rawEntryMap)) {
        if (rawValue === true || rawValue === false) {
          nextEntryMap[isoDate] = rawValue;
        } else if (
          rawValue === "checked" ||
          rawValue === "missed" ||
          rawValue === "thinking"
        ) {
          nextEntryMap[isoDate] = rawValue;
        } else if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
          nextEntryMap[isoDate] = Math.max(0, Math.floor(rawValue));
        }
      }
      if (Object.keys(nextEntryMap).length > 0) {
        entries[habitId] = nextEntryMap;
      }
    }
  }

  return {
    blockId:
      typeof rawAttrs.blockId === "string" && rawAttrs.blockId.length > 0
        ? rawAttrs.blockId
        : crypto.randomUUID(),
    blockType: "habitTracker",
    preset:
      rawAttrs.preset === "weekly-grid" || rawAttrs.preset === "streak-cards"
        ? rawAttrs.preset
        : "monthly-grid",
    title:
      typeof rawAttrs.title === "string" && rawAttrs.title.length > 0
        ? rawAttrs.title
        : "Habit Tracker",
    anchorDate:
      typeof rawAttrs.anchorDate === "string" && rawAttrs.anchorDate.length > 0
        ? rawAttrs.anchorDate
        : todayIso(),
    weekStartsOn: rawAttrs.weekStartsOn === "monday" ? "monday" : "sunday",
    showStats: rawAttrs.showStats !== false,
    showBackground: rawAttrs.showBackground !== false,
    showBorder: rawAttrs.showBorder !== false,
    habits,
    entries,
  };
}

export function parseIsoDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    const fallback = new Date();
    fallback.setHours(12, 0, 0, 0);
    return fallback;
  }

  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function formatIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(isoDate: string, days: number): string {
  const next = parseIsoDate(isoDate);
  next.setDate(next.getDate() + days);
  return formatIsoDate(next);
}

export function addMonths(isoDate: string, months: number): string {
  const current = parseIsoDate(isoDate);
  const year = current.getFullYear();
  const month = current.getMonth();
  const day = current.getDate();

  const target = new Date(year, month + months, 1, 12, 0, 0, 0);
  const maxDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, maxDay));
  return formatIsoDate(target);
}

export function getHabitTrackerVisibleRange(
  preset: HabitTrackerPreset,
  anchorDate: string,
  weekStartsOn: HabitWeekStartsOn
): HabitTrackerVisibleRange {
  if (preset === "monthly-grid" || preset === "streak-cards") {
    const anchor = parseIsoDate(anchorDate);
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12, 0, 0, 0);
    const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 12, 0, 0, 0);
    return {
      preset,
      label: new Intl.DateTimeFormat("en-US", {
        month: "long",
        year: "numeric",
      }).format(anchor),
      dates: enumerateDates(start, end),
    };
  }

  if (preset === "weekly-grid") {
    const start = getStartOfWeek(anchorDate, weekStartsOn);
    const dates = Array.from({ length: 7 }, (_, index) => addDays(start, index));
    return {
      preset,
      label: formatRangeLabel(dates[0], dates[dates.length - 1]),
      dates,
    };
  }

  const dates = Array.from({ length: 14 }, (_, index) => addDays(anchorDate, index - 13));
  return {
    preset,
    label: `14-day window ending ${formatDisplayDate(anchorDate, {
      month: "short",
      day: "numeric",
      year: "numeric",
    })}`,
    dates,
  };
}

export function getPeriodShiftedAnchorDate(
  preset: HabitTrackerPreset,
  anchorDate: string,
  direction: -1 | 1
): string {
  if (preset === "monthly-grid" || preset === "streak-cards") {
    return addMonths(anchorDate, direction);
  }

  if (preset === "weekly-grid") {
    return addDays(anchorDate, direction * 7);
  }

  return addMonths(anchorDate, direction);
}

export function getStartOfWeek(
  anchorDate: string,
  weekStartsOn: HabitWeekStartsOn
): string {
  const anchor = parseIsoDate(anchorDate);
  const weekday = anchor.getDay();
  const offset = weekStartsOn === "monday"
    ? (weekday === 0 ? -6 : 1 - weekday)
    : -weekday;
  anchor.setDate(anchor.getDate() + offset);
  return formatIsoDate(anchor);
}

export function getEntryValue(
  entries: HabitTrackerEntries,
  habitId: string,
  isoDate: string,
  intervalId?: string
): HabitTrackerEntryValue | undefined {
  return entries[getHabitEntryBucketId(habitId, intervalId)]?.[isoDate];
}

export function updateHabitEntry(
  entries: HabitTrackerEntries,
  habitId: string,
  isoDate: string,
  value: HabitTrackerEntryValue | null | undefined,
  intervalId?: string
): HabitTrackerEntries {
  const bucketId = getHabitEntryBucketId(habitId, intervalId);
  const nextEntries: HabitTrackerEntries = {
    ...entries,
    [bucketId]: {
      ...(entries[bucketId] || {}),
    },
  };

  const shouldDelete =
    value == null || value === false || (typeof value === "number" && value <= 0);

  if (shouldDelete) {
    delete nextEntries[bucketId][isoDate];
    if (Object.keys(nextEntries[bucketId]).length === 0) {
      delete nextEntries[bucketId];
    }
    return nextEntries;
  }

  nextEntries[bucketId][isoDate] = value;
  return nextEntries;
}

export function getHabitEntryBucketId(habitId: string, intervalId?: string): string {
  return intervalId ? `${habitId}::${intervalId}` : habitId;
}

export function parseHabitEntryBucketId(bucketId: string): {
  habitId: string;
  intervalId: string | null;
} {
  const delimiterIndex = bucketId.indexOf("::");
  if (delimiterIndex === -1) {
    return { habitId: bucketId, intervalId: null };
  }
  return {
    habitId: bucketId.slice(0, delimiterIndex),
    intervalId: bucketId.slice(delimiterIndex + 2),
  };
}

export function getHabitEntryDates(
  entries: HabitTrackerEntries,
  habit: HabitDefinition
): string[] {
  const dates = new Set<string>();
  const baseEntries = entries[habit.id];
  if (baseEntries) {
    for (const date of Object.keys(baseEntries)) {
      dates.add(date);
    }
  }
  for (const interval of getStoredHabitIntervals(habit)) {
    const intervalEntries = entries[getHabitEntryBucketId(habit.id, interval.id)];
    if (!intervalEntries) continue;
    for (const date of Object.keys(intervalEntries)) {
      dates.add(date);
    }
  }
  return Array.from(dates);
}

export function getHabitDayValues(
  habit: HabitDefinition,
  entries: HabitTrackerEntries,
  isoDate: string
): HabitTrackerEntryValue[] {
  const intervals = getRenderableHabitIntervals(habit);
  if (intervals.length === 0) {
    const value = getEntryValue(entries, habit.id, isoDate);
    if (value !== undefined) return [value];

    const fallbackIntervalValues = getStoredHabitIntervals(habit)
      .map((interval) => getEntryValue(entries, habit.id, isoDate, interval.id))
      .filter((value): value is HabitTrackerEntryValue => value !== undefined);
    return fallbackIntervalValues;
  }

  return intervals
    .map((interval) => getEntryValue(entries, habit.id, isoDate, interval.id))
    .filter((value): value is HabitTrackerEntryValue => value !== undefined);
}

export function getHabitDayValue(
  habit: HabitDefinition,
  entries: HabitTrackerEntries,
  isoDate: string
): HabitTrackerEntryValue | undefined {
  const intervals = getRenderableHabitIntervals(habit);
  if (intervals.length === 0) {
    const directValue = getEntryValue(entries, habit.id, isoDate);
    if (directValue !== undefined) return directValue;

    const fallbackValues = getStoredHabitIntervals(habit)
      .map((interval) => getEntryValue(entries, habit.id, isoDate, interval.id))
      .filter((value): value is HabitTrackerEntryValue => value !== undefined);
    return fallbackValues[0];
  }

  return undefined;
}

export function coerceHabitEntriesForMode(
  entries: HabitTrackerEntries,
  habitId: string,
  nextMode: HabitValueMode,
  target: number
): HabitTrackerEntries {
  const nextEntries = { ...entries };
  const bucketIds = Object.keys(entries).filter((bucketId) => {
    const parsed = parseHabitEntryBucketId(bucketId);
    return parsed.habitId === habitId;
  });

  for (const bucketId of bucketIds) {
    const current = entries[bucketId];
    if (!current) continue;

    const normalized: Record<string, HabitTrackerEntryValue> = {};
    for (const [isoDate, rawValue] of Object.entries(current)) {
      if (nextMode === "boolean") {
        if (rawValue === true) {
          normalized[isoDate] = true;
        } else if (rawValue === "checked") {
          normalized[isoDate] = true;
        } else if (typeof rawValue === "number" && rawValue > 0) {
          normalized[isoDate] = true;
        }
      } else if (nextMode === "count") {
        if (typeof rawValue === "number") {
          if (rawValue > 0) normalized[isoDate] = rawValue;
        } else if (rawValue === true || rawValue === "checked") {
          normalized[isoDate] = Math.max(1, target || 1);
        }
      } else if (nextMode === "status") {
        if (
          rawValue === "checked" ||
          rawValue === "missed" ||
          rawValue === "thinking"
        ) {
          normalized[isoDate] = rawValue;
        } else if (rawValue === true) {
          normalized[isoDate] = "checked";
        } else if (typeof rawValue === "number" && rawValue > 0) {
          normalized[isoDate] = "checked";
        }
      }
    }

    if (Object.keys(normalized).length === 0) {
      delete nextEntries[bucketId];
    } else {
      nextEntries[bucketId] = normalized;
    }
  }
  return nextEntries;
}

export function renameHabitEntries(
  entries: HabitTrackerEntries,
  oldHabitId: string,
  newHabitId: string
): HabitTrackerEntries {
  if (oldHabitId === newHabitId || !entries[oldHabitId]) return entries;
  const nextEntries = { ...entries };
  nextEntries[newHabitId] = { ...entries[oldHabitId] };
  delete nextEntries[oldHabitId];
  return nextEntries;
}

export function removeHabitEntries(
  entries: HabitTrackerEntries,
  habitId: string
): HabitTrackerEntries {
  const nextEntries = { ...entries };
  for (const bucketId of Object.keys(entries)) {
    if (parseHabitEntryBucketId(bucketId).habitId === habitId) {
      delete nextEntries[bucketId];
    }
  }
  return nextEntries;
}

export function syncHabitIntervalEntries(
  entries: HabitTrackerEntries,
  habit: HabitDefinition,
  nextIntervalMode: HabitIntervalEntryMode,
  nextIntervals: HabitIntervalDefinition[]
): HabitTrackerEntries {
  const nextEntries = { ...entries };
  const storedIntervals = getStoredHabitIntervals(habit);
  const baseEntries = entries[habit.id] || {};
  const currentIntervalMaps = storedIntervals.map(
    (interval) => entries[getHabitEntryBucketId(habit.id, interval.id)] || {}
  );

  for (const bucketId of Object.keys(entries)) {
    if (parseHabitEntryBucketId(bucketId).habitId === habit.id) {
      delete nextEntries[bucketId];
    }
  }

  if (nextIntervalMode === "single") {
    const merged: Record<string, HabitTrackerEntryValue> = { ...baseEntries };
    const allDates = new Set<string>(Object.keys(baseEntries));
    for (const intervalMap of currentIntervalMaps) {
      for (const date of Object.keys(intervalMap)) {
        allDates.add(date);
      }
    }

    for (const isoDate of allDates) {
      if (merged[isoDate] !== undefined) continue;
      const intervalValues = currentIntervalMaps
        .map((intervalMap) => intervalMap[isoDate])
        .filter((value): value is HabitTrackerEntryValue => value !== undefined);
      if (intervalValues.length === 0) continue;
      if (habit.valueMode === "count") {
        const nextCount = intervalValues.reduce<number>((sum, value) => {
          if (typeof value === "number") return sum + value;
          if (value === true || value === "checked") return sum + habit.target;
          return sum;
        }, 0);
        merged[isoDate] = nextCount;
      } else {
        merged[isoDate] = intervalValues.find((value) => value === true || value === "checked") ??
          intervalValues[0];
      }
    }

    if (Object.keys(merged).length > 0) {
      nextEntries[habit.id] = merged;
    }
    return nextEntries;
  }

  const normalizedIntervals = normalizeHabitIntervals(nextIntervals, nextIntervals.length || 1);
  normalizedIntervals.forEach((interval, index) => {
    const existingByIndex = currentIntervalMaps[index];
    const fallbackSource = Object.keys(existingByIndex || {}).length > 0 ? existingByIndex : baseEntries;
    if (Object.keys(fallbackSource).length > 0) {
      nextEntries[getHabitEntryBucketId(habit.id, interval.id)] = { ...fallbackSource };
    }
  });

  return nextEntries;
}

export function isHabitComplete(
  habit: HabitDefinition,
  value: HabitTrackerEntryValue | undefined
): boolean {
  if (habit.valueMode === "count") {
    return typeof value === "number" && value >= Math.max(1, habit.target || 1);
  }

  if (habit.valueMode === "status") {
    return value === "checked";
  }

  return value === true;
}

export function isHabitDayComplete(
  habit: HabitDefinition,
  entries: HabitTrackerEntries,
  isoDate: string
): boolean {
  const intervals = getRenderableHabitIntervals(habit);
  if (intervals.length === 0) {
    return isHabitComplete(habit, getHabitDayValue(habit, entries, isoDate));
  }

  return intervals.every((interval) =>
    isHabitComplete(habit, getEntryValue(entries, habit.id, isoDate, interval.id))
  );
}

export function getHabitCompletionStats(
  habit: HabitDefinition,
  entries: HabitTrackerEntries,
  visibleDates: string[]
): HabitCompletionStats {
  const completedFlags = visibleDates.map((isoDate) =>
    isHabitDayComplete(habit, entries, isoDate)
  );

  const hitDays = completedFlags.filter(Boolean).length;
  const totalDays = visibleDates.length;
  const completionRate = totalDays === 0 ? 0 : Math.round((hitDays / totalDays) * 100);

  let currentStreak = 0;
  for (let index = completedFlags.length - 1; index >= 0; index -= 1) {
    if (!completedFlags[index]) break;
    currentStreak += 1;
  }

  return {
    hitDays,
    totalDays,
    completionRate,
    currentStreak,
  };
}

export function formatDisplayDate(
  isoDate: string,
  options: Intl.DateTimeFormatOptions
): string {
  return new Intl.DateTimeFormat("en-US", options).format(parseIsoDate(isoDate));
}

export function getShortDayLabel(isoDate: string): string {
  return formatDisplayDate(isoDate, { weekday: "short" });
}

export function getDayOfMonthLabel(isoDate: string): string {
  return formatDisplayDate(isoDate, { day: "numeric" });
}

export function formatTimeInputValue(minutes: number): string {
  const normalized = clampIntervalMinute(minutes);
  const hour = Math.floor(normalized / 60) % 24;
  const minute = normalized % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function parseTimeInputValue(value: string): number {
  const [rawHour, rawMinute] = value.split(":").map(Number);
  if (!Number.isFinite(rawHour) || !Number.isFinite(rawMinute)) {
    return 0;
  }
  return clampIntervalMinute(rawHour * 60 + rawMinute);
}

function formatCompactTime(minutes: number, includeMeridiem: boolean): string {
  if (minutes === MINUTES_PER_DAY) {
    return includeMeridiem ? "12AM" : "12";
  }
  const hour24 = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  const meridiem = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const minuteText = minute === 0 ? "" : `:${String(minute).padStart(2, "0")}`;
  return `${hour12}${minuteText}${includeMeridiem ? meridiem : ""}`;
}

export function formatHabitIntervalLabel(interval: HabitIntervalDefinition): string {
  const startMeridiem = interval.startMinute >= 12 * 60 ? "PM" : "AM";
  const endMeridiem =
    interval.endMinute === MINUTES_PER_DAY
      ? "AM"
      : interval.endMinute >= 12 * 60
        ? "PM"
        : "AM";
  const omitStartMeridiem = startMeridiem === endMeridiem;
  return `${formatCompactTime(interval.startMinute, !omitStartMeridiem)}-${formatCompactTime(
    interval.endMinute,
    true
  )}`;
}

export function getCompactEntryText(
  habit: HabitDefinition,
  value: HabitTrackerEntryValue | undefined
): string {
  if (habit.valueMode === "count") {
    const numericValue = typeof value === "number" ? value : 0;
    const suffix = habit.unit ? ` ${habit.unit}` : "";
    return `${numericValue}/${Math.max(1, habit.target || 1)}${suffix}`;
  }

  if (habit.valueMode === "status") {
    if (value === "checked") return "Checked";
    if (value === "missed") return "Missed";
    if (value === "thinking") return "Thinking";
    return "Pending";
  }

  return value === true ? "Done" : "Missed";
}

export function getHabitDaySummaryText(
  habit: HabitDefinition,
  entries: HabitTrackerEntries,
  isoDate: string
): string {
  const intervals = getRenderableHabitIntervals(habit);
  if (intervals.length === 0) {
    return getCompactEntryText(habit, getHabitDayValue(habit, entries, isoDate));
  }

  return intervals
    .map((interval) => {
      const intervalValue = getEntryValue(entries, habit.id, isoDate, interval.id);
      return `${formatHabitIntervalLabel(interval)} ${getCompactEntryText(habit, intervalValue)}`;
    })
    .join(" • ");
}

export function getStatusDisplaySymbol(
  value: HabitStatusValue | undefined
): string {
  if (value === "checked") return "✓";
  if (value === "missed") return "×";
  if (value === "thinking") return "◌";
  return "";
}

export function getIconTextFallback(
  icon: string | undefined,
  fallback = "•"
): string {
  if (!icon) return fallback;
  if (icon.startsWith("emoji:")) {
    return icon.replace("emoji:", "") || fallback;
  }
  if (icon.startsWith("lucide:")) {
    return fallback;
  }
  return icon;
}

export function getNextStatusValue(
  value: HabitTrackerEntryValue | undefined
): HabitStatusValue | null {
  if (value === "checked") return "missed";
  if (value === "missed") return "thinking";
  if (value === "thinking") return null;
  return "checked";
}

export function getPresetLabel(preset: HabitTrackerPreset): string {
  switch (preset) {
    case "monthly-grid":
      return "Monthly Grid";
    case "weekly-grid":
      return "Weekly Grid";
    case "streak-cards":
      return "Streak Cards";
    default:
      return preset;
  }
}

function enumerateDates(start: Date, end: Date): string[] {
  const results: string[] = [];
  for (let cursor = new Date(start); cursor.getTime() <= end.getTime(); cursor = new Date(cursor.getTime() + DAY_MS)) {
    results.push(formatIsoDate(cursor));
  }
  return results;
}

function formatRangeLabel(startIso: string, endIso: string): string {
  const start = parseIsoDate(startIso);
  const end = parseIsoDate(endIso);
  const sameYear = start.getFullYear() === end.getFullYear();
  const sameMonth = sameYear && start.getMonth() === end.getMonth();

  if (sameMonth) {
    const monthYear = new Intl.DateTimeFormat("en-US", {
      month: "short",
      year: "numeric",
    }).format(start);
    return `${monthYear} ${start.getDate()}-${end.getDate()}`;
  }

  if (sameYear) {
    return `${formatDisplayDate(startIso, { month: "short", day: "numeric" })} - ${formatDisplayDate(endIso, { month: "short", day: "numeric", year: "numeric" })}`;
  }

  return `${formatDisplayDate(startIso, { month: "short", day: "numeric", year: "numeric" })} - ${formatDisplayDate(endIso, { month: "short", day: "numeric", year: "numeric" })}`;
}
