import { Node, mergeAttributes } from "@tiptap/core";
import type { DOMOutputSpec } from "@tiptap/pm/model";
import * as LucideIcons from "lucide-react";
import type { ComponentType } from "react";
import { z } from "zod";

import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import {
  createBlockNodeView,
  syncAttrsToPanel,
} from "@/lib/domain/blocks/node-view-factory";
import {
  coerceHabitEntriesForMode,
  DEFAULT_STATUS_ICON,
  formatHabitIntervalLabel,
  formatDisplayDate,
  getDayOfMonthLabel,
  getEntryValue,
  getHabitCompletionStats,
  getHabitDaySummaryText,
  getHabitDayValue,
  getHabitTrackerVisibleRange,
  getIconTextFallback,
  getNextStatusValue,
  getPeriodShiftedAnchorDate,
  getPresetLabel,
  getRenderableHabitIntervals,
  getStatusDisplaySymbol,
  getShortDayLabel,
  isHabitDayComplete,
  isHabitComplete,
  normalizeHabitTrackerAttrs,
  todayIso,
  updateHabitEntry,
  type HabitDefinition,
  type HabitTrackerAttrs,
  type HabitTrackerEntries,
  type HabitStatusValue,
} from "@/lib/domain/habit-tracker";
import { useBlockStore } from "@/state/block-store";
import { useRightPanelCollapseStore } from "@/state/right-panel-collapse-store";

const { schema: habitTrackerSchema, defaults: habitTrackerDefaults } =
  createBlockSchema("habitTracker", {
    preset: z
      .enum(["monthly-grid", "weekly-grid", "streak-cards"])
      .default("monthly-grid")
      .describe("Tracker layout preset"),
    title: z.string().default("Habit Tracker").describe("Tracker title"),
    anchorDate: z
      .string()
      .default("")
      .describe("Anchor date controlling the visible period (YYYY-MM-DD)"),
    weekStartsOn: z
      .enum(["sunday", "monday"])
      .default("sunday")
      .describe("First day of the week"),
    showStats: z.boolean().default(true).describe("Show completion stats"),
    showBackground: z.boolean().default(true).describe("Show background fill"),
    showBorder: z.boolean().default(true).describe("Show border"),
    habits: z
      .array(z.unknown())
      .default([])
      .describe("Configured habits"),
    entries: z
      .record(z.string(), z.unknown())
      .default({})
      .describe("Per-habit checkins keyed by habitId then date"),
  });

registerBlock({
  type: "habitTracker",
  label: "Habit Tracker",
  description: "Preset-driven habit tracking block with stats and period navigation",
  iconName: "CalendarCheck2",
  family: "content",
  group: "display",
  contentModel: null,
  atom: true,
  attrsSchema: habitTrackerSchema,
  defaultAttrs: {
    ...habitTrackerDefaults(),
    anchorDate: todayIso(),
  },
  slashCommand: "/habit-tracker",
  searchTerms: ["habit", "tracker", "streak", "check-in", "monthly", "weekly"],
  hiddenFields: ["habits", "entries"],
});

function parseJsonAttribute<T>(
  element: HTMLElement,
  attributeName: string,
  fallback: T
): T {
  const raw = element.getAttribute(attributeName);
  if (!raw) return fallback;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function resolveTrackerAttrs(rawAttrs: Record<string, unknown>): HabitTrackerAttrs {
  const defaults = habitTrackerDefaults() as unknown as Record<string, unknown>;
  return normalizeHabitTrackerAttrs({
    ...defaults,
    anchorDate: todayIso(),
    ...rawAttrs,
    blockType: "habitTracker",
  });
}

function dispatchTrackerAttrChange(
  blockId: string,
  key: string,
  value: unknown
) {
  window.dispatchEvent(
    new CustomEvent("block-attrs-change", {
      detail: { blockId, key, value },
    })
  );
}

function getLucideIconComponent(icon: string | undefined) {
  if (!icon?.startsWith("lucide:")) return null;
  const iconName = icon.replace("lucide:", "");
  return (
    LucideIcons as unknown as Record<string, ComponentType<{ className?: string }>>
  )[iconName] || null;
}

type LucideIconNode = Array<[string, Record<string, string>]>;

function appendLucideIcon(
  target: HTMLElement,
  LucideIcon: ComponentType<{ className?: string }>,
  className?: string
) {
  const rendered = (LucideIcon as unknown as {
    render?: (props: { className?: string }, ref: null) => { props?: { iconNode?: LucideIconNode } };
  }).render?.({ className }, null);
  const iconNode = rendered?.props?.iconNode;
  if (!iconNode) return false;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("stroke-width", "2");
  if (className) {
    svg.setAttribute("class", className);
  }

  for (const [tagName, attrs] of iconNode) {
    const child = document.createElementNS("http://www.w3.org/2000/svg", tagName);
    for (const [attrName, attrValue] of Object.entries(attrs)) {
      if (attrName === "key") continue;
      child.setAttribute(attrName, String(attrValue));
    }
    svg.appendChild(child);
  }

  target.appendChild(svg);
  return true;
}

function setStoredIconContent(
  target: HTMLElement,
  icon: string | undefined,
  options?: {
    className?: string;
    fallbackText?: string;
  }
) {
  target.innerHTML = "";

  if (icon?.startsWith("emoji:")) {
    target.textContent = icon.replace("emoji:", "") || options?.fallbackText || "";
    return;
  }

  const LucideIcon = getLucideIconComponent(icon);
  if (LucideIcon) {
    if (appendLucideIcon(target, LucideIcon, options?.className)) {
      return;
    }
  }

  target.textContent = options?.fallbackText || getIconTextFallback(icon, "•");
}

function getStatusStoredIcon(habit: HabitDefinition, value: HabitStatusValue | undefined) {
  if (value === "checked") return "lucide:Check";
  if (value === "missed") return "lucide:X";
  if (value === "thinking") return habit.statusIcon || DEFAULT_STATUS_ICON;
  return null;
}

function openTrackerSettings(blockId: string, attrs: HabitTrackerAttrs) {
  useBlockStore.getState().setSelectedBlock(blockId, "habitTracker");
  useBlockStore.getState().openProperties();
  useRightPanelCollapseStore.getState().setCollapsed(false);
  syncAttrsToPanel(blockId, attrs as unknown as Record<string, unknown>);
}

function renderPeriodControls(
  attrs: HabitTrackerAttrs,
  headerActions: HTMLElement
) {
  const makeButton = (label: string, onClick: () => void, title: string) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "habit-tracker-nav-btn";
    button.textContent = label;
    button.title = title;
    button.addEventListener("click", onClick);
    headerActions.appendChild(button);
  };

  const blockId = attrs.blockId;
  makeButton("‹", () => {
    dispatchTrackerAttrChange(
      blockId,
      "anchorDate",
      getPeriodShiftedAnchorDate(attrs.preset, attrs.anchorDate, -1)
    );
  }, "Previous period");

  makeButton("Today", () => {
    dispatchTrackerAttrChange(blockId, "anchorDate", todayIso());
  }, "Jump to today");

  makeButton("›", () => {
    dispatchTrackerAttrChange(
      blockId,
      "anchorDate",
      getPeriodShiftedAnchorDate(attrs.preset, attrs.anchorDate, 1)
    );
  }, "Next period");
}

function renderTrackerHeader(
  attrs: HabitTrackerAttrs,
  contentDom: HTMLElement,
  label: string
) {
  const header = document.createElement("div");
  header.className = "habit-tracker-header";

  const titleWrap = document.createElement("div");
  titleWrap.className = "habit-tracker-title-wrap";

  const title = document.createElement("div");
  title.className = "habit-tracker-title";
  title.textContent = attrs.title || "Habit Tracker";
  titleWrap.appendChild(title);

  const subtitle = document.createElement("div");
  subtitle.className = "habit-tracker-subtitle";
  subtitle.textContent = getPresetLabel(attrs.preset);
  titleWrap.appendChild(subtitle);

  const periodLabel = document.createElement("div");
  periodLabel.className = "habit-tracker-period-label";
  periodLabel.textContent = label;
  titleWrap.appendChild(periodLabel);
  header.appendChild(titleWrap);

  const actions = document.createElement("div");
  actions.className = "habit-tracker-header-actions";
  renderPeriodControls(attrs, actions);

  const settingsButton = document.createElement("button");
  settingsButton.type = "button";
  settingsButton.className = "habit-tracker-settings-btn";
  settingsButton.textContent = "Edit";
  settingsButton.addEventListener("click", () => {
    openTrackerSettings(attrs.blockId, attrs);
  });
  actions.appendChild(settingsButton);

  header.appendChild(actions);
  contentDom.appendChild(header);
}

function renderEmptyState(attrs: HabitTrackerAttrs, contentDom: HTMLElement) {
  const empty = document.createElement("div");
  empty.className = "habit-tracker-empty";

  const heading = document.createElement("div");
  heading.className = "habit-tracker-empty-title";
  heading.textContent = "No habits configured yet";
  empty.appendChild(heading);

  const copy = document.createElement("p");
  copy.className = "habit-tracker-empty-copy";
  copy.textContent =
    "Open the tracker settings to add habits, choose a preset, and start checking in.";
  empty.appendChild(copy);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "habit-tracker-empty-btn";
  button.textContent = "Add your first habit";
  button.addEventListener("click", () => {
    openTrackerSettings(attrs.blockId, attrs);
  });
  empty.appendChild(button);

  contentDom.appendChild(empty);
}

function renderStatBadges(
  parent: HTMLElement,
  habit: HabitDefinition,
  stats: ReturnType<typeof getHabitCompletionStats>
) {
  const badges = document.createElement("div");
  badges.className = "habit-tracker-stat-badges";
  const splitMode = getRenderableHabitIntervals(habit).length > 0;

  const rate = document.createElement("span");
  rate.className = "habit-tracker-stat";
  rate.textContent = `${stats.completionRate}% complete`;
  badges.appendChild(rate);

  const hitDays = document.createElement("span");
  hitDays.className = "habit-tracker-stat";
  hitDays.textContent = `${stats.hitDays}/${stats.totalDays} ${splitMode ? "full days" : "days"}`;
  badges.appendChild(hitDays);

  const streak = document.createElement("span");
  streak.className = "habit-tracker-stat";
  streak.textContent = `${stats.currentStreak} day streak`;
  badges.appendChild(streak);

  parent.appendChild(badges);
}

function createCountStepper(
  attrs: HabitTrackerAttrs,
  habit: HabitDefinition,
  isoDate: string,
  currentValue: number,
  intervalId?: string
) {
  const wrapper = document.createElement("div");
  wrapper.className = "habit-tracker-count-stepper";

  const decrement = document.createElement("button");
  decrement.type = "button";
  decrement.className = "habit-tracker-stepper-btn";
  decrement.textContent = "−";
  decrement.addEventListener("click", () => {
    const nextEntries = updateEntryForCount(
      attrs.entries,
      habit.id,
      isoDate,
      currentValue - 1,
      intervalId
    );
    dispatchTrackerAttrChange(attrs.blockId, "entries", nextEntries);
  });
  wrapper.appendChild(decrement);

  const value = document.createElement("span");
  value.className = "habit-tracker-count-value";
  value.textContent = String(currentValue);
  wrapper.appendChild(value);

  const increment = document.createElement("button");
  increment.type = "button";
  increment.className = "habit-tracker-stepper-btn";
  increment.textContent = "+";
  increment.addEventListener("click", () => {
    const nextEntries = updateEntryForCount(
      attrs.entries,
      habit.id,
      isoDate,
      currentValue + 1,
      intervalId
    );
    dispatchTrackerAttrChange(attrs.blockId, "entries", nextEntries);
  });
  wrapper.appendChild(increment);

  return wrapper;
}

function updateEntryForCount(
  entries: HabitTrackerEntries,
  habitId: string,
  isoDate: string,
  nextValue: number,
  intervalId?: string
): HabitTrackerEntries {
  const normalizedValue = Math.max(0, Math.floor(nextValue));
  if (normalizedValue === 0) {
    return updateHabitEntry(entries, habitId, isoDate, null, intervalId);
  }
  return updateHabitEntry(entries, habitId, isoDate, normalizedValue, intervalId);
}

function updateEntryForBoolean(
  entries: HabitTrackerEntries,
  habitId: string,
  isoDate: string,
  nextValue: boolean,
  intervalId?: string
): HabitTrackerEntries {
  return updateHabitEntry(entries, habitId, isoDate, nextValue ? true : null, intervalId);
}

function createCellContent(
  attrs: HabitTrackerAttrs,
  habit: HabitDefinition,
  isoDate: string,
  intervalId?: string
) {
  const currentValue =
    intervalId != null
      ? getEntryValue(attrs.entries, habit.id, isoDate, intervalId)
      : getHabitDayValue(habit, attrs.entries, isoDate);
  const cell = document.createElement("button");
  cell.type = "button";
  cell.className = "habit-tracker-cell";
  const isComplete =
    intervalId != null
      ? isHabitComplete(habit, currentValue)
      : isHabitDayComplete(habit, attrs.entries, isoDate);
  cell.setAttribute(
    "data-complete",
    isComplete ? "true" : "false"
  );
  cell.setAttribute("data-mode", habit.valueMode);
  cell.title = `${habit.name} • ${formatDisplayDate(isoDate, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;

  if (habit.valueMode === "count") {
    const numericValue = typeof currentValue === "number" ? currentValue : 0;
    cell.classList.add("habit-tracker-cell-count");
    cell.appendChild(createCountStepper(attrs, habit, isoDate, numericValue, intervalId));
    return cell;
  }

  if (habit.valueMode === "status") {
    const statusValue =
      currentValue === "checked" ||
      currentValue === "missed" ||
      currentValue === "thinking"
        ? currentValue
        : undefined;
    setStoredIconContent(cell, getStatusStoredIcon(habit, statusValue) || undefined, {
      className: "habit-tracker-cell-icon",
      fallbackText: getStatusDisplaySymbol(statusValue),
    });
    cell.setAttribute("data-status", statusValue || "empty");
    cell.addEventListener("click", () => {
      const nextEntries = updateHabitEntry(
        attrs.entries,
        habit.id,
        isoDate,
        getNextStatusValue(currentValue),
        intervalId
      );
      dispatchTrackerAttrChange(attrs.blockId, "entries", nextEntries);
    });
    return cell;
  }

  cell.textContent = currentValue === true ? "✓" : "";
  cell.addEventListener("click", () => {
    const nextEntries = updateEntryForBoolean(
      attrs.entries,
      habit.id,
      isoDate,
      currentValue !== true,
      intervalId
    );
    dispatchTrackerAttrChange(attrs.blockId, "entries", nextEntries);
  });
  return cell;
}

function renderStatsTable(
  attrs: HabitTrackerAttrs,
  contentDom: HTMLElement,
  dates: string[]
) {
  const wrap = document.createElement("div");
  wrap.className = "habit-tracker-stats-wrap";

  const table = document.createElement("table");
  table.className = "habit-tracker-stats-table";

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  for (const label of ["Habit", "Complete", "Days", "Streak"]) {
    const cell = document.createElement("th");
    cell.className = "habit-tracker-stats-header";
    cell.textContent = label;
    headerRow.appendChild(cell);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const habit of attrs.habits) {
    const stats = getHabitCompletionStats(habit, attrs.entries, dates);
    const row = document.createElement("tr");
    row.className = "habit-tracker-stats-row";

    const habitCell = document.createElement("th");
    habitCell.className = "habit-tracker-stats-habit";
    habitCell.scope = "row";

    const chip = document.createElement("div");
    chip.className = "habit-tracker-habit-chip";

    const icon = document.createElement("span");
    icon.className = "habit-tracker-habit-icon";
    setStoredIconContent(icon, habit.icon, {
      className: "habit-tracker-icon-svg",
      fallbackText: getIconTextFallback(habit.icon, "•"),
    });
    icon.style.color = habit.color;
    chip.appendChild(icon);

    const name = document.createElement("span");
    name.className = "habit-tracker-habit-name";
    name.textContent = habit.name;
    chip.appendChild(name);

    habitCell.appendChild(chip);
    row.appendChild(habitCell);

    const completionCell = document.createElement("td");
    completionCell.className = "habit-tracker-stats-value";
    completionCell.textContent = `${stats.completionRate}% complete`;
    row.appendChild(completionCell);

    const daysCell = document.createElement("td");
    daysCell.className = "habit-tracker-stats-value";
    daysCell.textContent = `${stats.hitDays}/${stats.totalDays} ${getRenderableHabitIntervals(habit).length > 0 ? "full days" : "days"}`;
    row.appendChild(daysCell);

    const streakCell = document.createElement("td");
    streakCell.className = "habit-tracker-stats-value";
    streakCell.textContent = `${stats.currentStreak} day streak`;
    row.appendChild(streakCell);

    tbody.appendChild(row);
  }

  table.appendChild(tbody);
  wrap.appendChild(table);
  contentDom.appendChild(wrap);
}

function renderGridRow(
  tbody: HTMLElement,
  attrs: HabitTrackerAttrs,
  habit: HabitDefinition,
  dates: string[],
  showIntervalColumn: boolean
) {
  const intervals = getRenderableHabitIntervals(habit);
  const rowCount = Math.max(1, intervals.length);
  const renderTimeLabels = showIntervalColumn && habit.showIntervalTimes !== false;

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const row = document.createElement("tr");
    row.className = intervals.length > 0 ? "habit-tracker-grid-row habit-tracker-grid-row-split" : "habit-tracker-grid-row";

    if (rowIndex === 0) {
      const habitCell = document.createElement("th");
      habitCell.className = "habit-tracker-habit-cell";
      habitCell.scope = "row";
      habitCell.rowSpan = rowCount;

      const chip = document.createElement("div");
      chip.className = "habit-tracker-habit-chip";

      const icon = document.createElement("span");
      icon.className = "habit-tracker-habit-icon";
      setStoredIconContent(icon, habit.icon, {
        className: "habit-tracker-icon-svg",
        fallbackText: getIconTextFallback(habit.icon, "•"),
      });
      icon.style.color = habit.color;
      chip.appendChild(icon);

      const textWrap = document.createElement("div");
      textWrap.className = "habit-tracker-habit-text";

      const name = document.createElement("span");
      name.className = "habit-tracker-habit-name";
      name.textContent = habit.name;
      textWrap.appendChild(name);

      chip.appendChild(textWrap);
      habitCell.appendChild(chip);
      row.appendChild(habitCell);
    }

    if (showIntervalColumn) {
      const intervalCell = document.createElement("th");
      intervalCell.className = "habit-tracker-interval-cell";
      intervalCell.scope = "row";
      if (renderTimeLabels && intervals.length > 0) {
        intervalCell.textContent = formatHabitIntervalLabel(intervals[rowIndex]);
      }
      row.appendChild(intervalCell);
    }

    for (const isoDate of dates) {
      const cell = document.createElement("td");
      cell.className = "habit-tracker-grid-cell";
      cell.appendChild(
        createCellContent(
          attrs,
          habit,
          isoDate,
          intervals.length > 0 ? intervals[rowIndex].id : undefined
        )
      );
      row.appendChild(cell);
    }
    tbody.appendChild(row);
  }
}

function renderGrid(
  attrs: HabitTrackerAttrs,
  contentDom: HTMLElement,
  dates: string[]
) {
  const showIntervalColumn = attrs.habits.some(
    (habit) =>
      getRenderableHabitIntervals(habit).length > 0 && habit.showIntervalTimes !== false
  );
  const scroller = document.createElement("div");
  scroller.className = "habit-tracker-grid-scroll";

  const table = document.createElement("table");
  table.className = "habit-tracker-grid";

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");

  const habitHeader = document.createElement("th");
  habitHeader.className = "habit-tracker-grid-header habit-tracker-grid-header-habit";
  habitHeader.textContent = "Habit";
  headerRow.appendChild(habitHeader);

  if (showIntervalColumn) {
    const timeHeader = document.createElement("th");
    timeHeader.className = "habit-tracker-grid-header habit-tracker-grid-header-interval";
    timeHeader.title = "Interval";
    const icon = document.createElement("span");
    icon.className = "habit-tracker-time-header-icon";
    setStoredIconContent(icon, "lucide:AlarmClock", {
      className: "habit-tracker-time-header-icon-svg",
      fallbackText: "⏰",
    });
    timeHeader.appendChild(icon);
    headerRow.appendChild(timeHeader);
  }

  for (const isoDate of dates) {
    const dayHeader = document.createElement("th");
    dayHeader.className = "habit-tracker-grid-header";

    const shortDay = document.createElement("span");
    shortDay.className = "habit-tracker-grid-weekday";
    shortDay.textContent = getShortDayLabel(isoDate);
    dayHeader.appendChild(shortDay);

    const dayNumber = document.createElement("span");
    dayNumber.className = "habit-tracker-grid-day";
    dayNumber.textContent = getDayOfMonthLabel(isoDate);
    dayHeader.appendChild(dayNumber);

    headerRow.appendChild(dayHeader);
  }

  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const habit of attrs.habits) {
    renderGridRow(tbody, attrs, habit, dates, showIntervalColumn);
  }
  table.appendChild(tbody);
  scroller.appendChild(table);
  contentDom.appendChild(scroller);
}

function renderStreakCards(
  attrs: HabitTrackerAttrs,
  contentDom: HTMLElement,
  dates: string[]
) {
  const cards = document.createElement("div");
  cards.className = "habit-tracker-cards";

  for (const habit of attrs.habits) {
    const stats = getHabitCompletionStats(habit, attrs.entries, dates);
    const card = document.createElement("div");
    card.className = "habit-tracker-card";

    const top = document.createElement("div");
    top.className = "habit-tracker-card-top";

    const identity = document.createElement("div");
    identity.className = "habit-tracker-card-identity";

    const icon = document.createElement("span");
    icon.className = "habit-tracker-habit-icon";
    setStoredIconContent(icon, habit.icon, {
      className: "habit-tracker-icon-svg",
      fallbackText: getIconTextFallback(habit.icon, "•"),
    });
    icon.style.color = habit.color;
    identity.appendChild(icon);

    const titleWrap = document.createElement("div");
    const name = document.createElement("div");
    name.className = "habit-tracker-habit-name";
    name.textContent = habit.name;
    titleWrap.appendChild(name);
    if (habit.valueMode === "count") {
      const target = document.createElement("div");
      target.className = "habit-tracker-habit-target";
      target.textContent = `Target ${habit.target}${habit.unit ? ` ${habit.unit}` : ""}`;
      titleWrap.appendChild(target);
    }
    identity.appendChild(titleWrap);
    top.appendChild(identity);

    if (attrs.showStats) {
      renderStatBadges(top, habit, stats);
    }
    card.appendChild(top);

    const strip = document.createElement("div");
    strip.className = "habit-tracker-card-strip";
    for (const isoDate of dates) {
      const item = document.createElement("div");
      item.className = "habit-tracker-card-day";
      item.setAttribute(
        "data-complete",
        isHabitDayComplete(habit, attrs.entries, isoDate)
          ? "true"
          : "false"
      );

      const label = document.createElement("span");
      label.className = "habit-tracker-card-day-label";
      label.textContent = getDayOfMonthLabel(isoDate);
      item.appendChild(label);

      const value = document.createElement("span");
      value.className = "habit-tracker-card-day-value";
      value.textContent = cellSymbolForStatic(habit, attrs.entries, isoDate) || "·";
      item.appendChild(value);

      strip.appendChild(item);
    }
    card.appendChild(strip);
    cards.appendChild(card);
  }

  contentDom.appendChild(cards);
}

function renderHabitTrackerContent(
  node: Parameters<
    Parameters<typeof createBlockNodeView>[0]["renderContent"]
  >[0],
  contentDom: HTMLElement
) {
  const attrs = resolveTrackerAttrs(node.attrs as Record<string, unknown>);
  contentDom.innerHTML = "";
  contentDom.className = "block-content";
  contentDom.classList.add("habit-tracker-content");
  contentDom.setAttribute(
    "data-background",
    attrs.showBackground ? "visible" : "hidden"
  );
  contentDom.setAttribute("data-preset", attrs.preset);

  const visibleRange = getHabitTrackerVisibleRange(
    attrs.preset,
    attrs.anchorDate,
    attrs.weekStartsOn
  );
  contentDom.style.setProperty("--habit-visible-days", String(visibleRange.dates.length));
  renderTrackerHeader(attrs, contentDom, visibleRange.label);

  if (attrs.habits.length === 0) {
    renderEmptyState(attrs, contentDom);
    return;
  }

  if (attrs.preset === "streak-cards") {
    renderStreakCards(attrs, contentDom, visibleRange.dates);
    return;
  }

  if (attrs.showStats) {
    renderStatsTable(attrs, contentDom, visibleRange.dates);
  }

  renderGrid(attrs, contentDom, visibleRange.dates);
}

function cellSymbolForStatic(
  habit: HabitDefinition,
  entries: HabitTrackerEntries,
  isoDate: string,
  intervalId?: string
): string {
  const value =
    intervalId != null
      ? getEntryValue(entries, habit.id, isoDate, intervalId)
      : getHabitDayValue(habit, entries, isoDate);
  const intervals = getRenderableHabitIntervals(habit);
  if (intervalId == null && intervals.length > 0) {
    const completedIntervals = intervals.filter((interval) =>
      isHabitComplete(habit, getEntryValue(entries, habit.id, isoDate, interval.id))
    ).length;
    return `${completedIntervals}/${intervals.length}`;
  }
  if (habit.valueMode === "count") {
    return String(typeof value === "number" ? value : 0);
  }
  if (habit.valueMode === "status") {
    return getStatusDisplaySymbol(
      value === "checked" || value === "missed" || value === "thinking"
        ? value
        : undefined
    );
  }
  return value === true ? "✓" : "·";
}

function buildStaticGrid(attrs: HabitTrackerAttrs, dates: string[]): DOMOutputSpec {
  const showIntervalColumn = attrs.habits.some(
    (habit) =>
      getRenderableHabitIntervals(habit).length > 0 && habit.showIntervalTimes !== false
  );
  const headerRow: DOMOutputSpec = [
    "tr",
    {},
    ["th", { class: "habit-tracker-grid-header habit-tracker-grid-header-habit" }, "Habit"],
    ...(showIntervalColumn
      ? [[
          "th",
          { class: "habit-tracker-grid-header habit-tracker-grid-header-interval" },
          "⏰",
        ] satisfies DOMOutputSpec]
      : []),
    ...dates.map<DOMOutputSpec>((isoDate) => [
      "th",
      { class: "habit-tracker-grid-header" },
      ["span", { class: "habit-tracker-grid-weekday" }, getShortDayLabel(isoDate)],
      ["span", { class: "habit-tracker-grid-day" }, getDayOfMonthLabel(isoDate)],
    ]),
  ];

  const bodyRows = attrs.habits.flatMap<DOMOutputSpec>((habit) => {
    const intervals = getRenderableHabitIntervals(habit);
    const rowCount = Math.max(1, intervals.length);

    return Array.from({ length: rowCount }, (_, rowIndex) => {
      const interval = intervals[rowIndex];
      const renderTimeLabels = showIntervalColumn && habit.showIntervalTimes !== false;
      return [
        "tr",
        { class: intervals.length > 0 ? "habit-tracker-grid-row habit-tracker-grid-row-split" : "habit-tracker-grid-row" },
        ...(rowIndex === 0
          ? [[
              "th",
              {
                class: "habit-tracker-habit-cell",
                rowspan: String(rowCount),
              },
              [
                "div",
                { class: "habit-tracker-habit-chip" },
                [
                  "span",
                  {
                    class: "habit-tracker-habit-icon",
                    style: `color: ${habit.color}`,
                  },
                  getIconTextFallback(habit.icon, "•"),
                ],
                [
                  "div",
                  { class: "habit-tracker-habit-text" },
                  ["span", { class: "habit-tracker-habit-name" }, habit.name],
                ],
              ],
            ] satisfies DOMOutputSpec]
          : []),
        ...(showIntervalColumn
          ? [[
              "th",
              { class: "habit-tracker-interval-cell" },
              renderTimeLabels && interval ? formatHabitIntervalLabel(interval) : "",
            ] satisfies DOMOutputSpec]
          : []),
        ...dates.map<DOMOutputSpec>((isoDate) => [
          "td",
          { class: "habit-tracker-grid-cell" },
          [
            "div",
            {
              class: "habit-tracker-cell-static",
              "data-complete":
                (interval
                  ? isHabitComplete(
                      habit,
                      getEntryValue(attrs.entries, habit.id, isoDate, interval.id)
                    )
                  : isHabitDayComplete(habit, attrs.entries, isoDate))
                  ? "true"
                  : "false",
            },
            cellSymbolForStatic(
              habit,
              attrs.entries,
              isoDate,
              interval ? interval.id : undefined
            ),
          ],
        ]),
      ];
    });
  });

  return [
    "div",
    { class: "habit-tracker-grid-scroll" },
    ["table", { class: "habit-tracker-grid" }, ["thead", {}, headerRow], ["tbody", {}, ...bodyRows]],
  ];
}

function buildStaticStatsTable(attrs: HabitTrackerAttrs, dates: string[]): DOMOutputSpec {
  return [
    "div",
    { class: "habit-tracker-stats-wrap" },
    [
      "table",
      { class: "habit-tracker-stats-table" },
      [
        "thead",
        {},
        [
          "tr",
          {},
          ["th", { class: "habit-tracker-stats-header" }, "Habit"],
          ["th", { class: "habit-tracker-stats-header" }, "Complete"],
          ["th", { class: "habit-tracker-stats-header" }, "Days"],
          ["th", { class: "habit-tracker-stats-header" }, "Streak"],
        ],
      ],
      [
        "tbody",
        {},
        ...attrs.habits.map<DOMOutputSpec>((habit) => {
          const stats = getHabitCompletionStats(habit, attrs.entries, dates);
          const splitMode = getRenderableHabitIntervals(habit).length > 0;
          return [
            "tr",
            { class: "habit-tracker-stats-row" },
            [
              "th",
              { class: "habit-tracker-stats-habit", scope: "row" },
              [
                "div",
                { class: "habit-tracker-habit-chip" },
                [
                  "span",
                  {
                    class: "habit-tracker-habit-icon",
                    style: `color: ${habit.color}`,
                  },
                  getIconTextFallback(habit.icon, "•"),
                ],
                ["span", { class: "habit-tracker-habit-name" }, habit.name],
              ],
            ],
            ["td", { class: "habit-tracker-stats-value" }, `${stats.completionRate}% complete`],
            [
              "td",
              { class: "habit-tracker-stats-value" },
              `${stats.hitDays}/${stats.totalDays} ${splitMode ? "full days" : "days"}`,
            ],
            ["td", { class: "habit-tracker-stats-value" }, `${stats.currentStreak} day streak`],
          ];
        }),
      ],
    ],
  ];
}

function buildStaticCards(attrs: HabitTrackerAttrs, dates: string[]): DOMOutputSpec {
  return [
    "div",
    { class: "habit-tracker-cards" },
    ...attrs.habits.map<DOMOutputSpec>((habit) => {
      const stats = getHabitCompletionStats(habit, attrs.entries, dates);
      return [
        "div",
        { class: "habit-tracker-card" },
        [
          "div",
          { class: "habit-tracker-card-top" },
          [
            "div",
            { class: "habit-tracker-card-identity" },
            [
              "span",
              {
                class: "habit-tracker-habit-icon",
                style: `color: ${habit.color}`,
              },
              getIconTextFallback(habit.icon, "•"),
            ],
            [
              "div",
              {},
              ["div", { class: "habit-tracker-habit-name" }, habit.name],
              ...(habit.valueMode === "count"
                ? [[
                    "div",
                    { class: "habit-tracker-habit-target" },
                    `Target ${habit.target}${habit.unit ? ` ${habit.unit}` : ""}`,
                  ] satisfies DOMOutputSpec]
                : []),
            ],
          ],
          ...(attrs.showStats
            ? [[
                "div",
                { class: "habit-tracker-stat-badges" },
                ["span", { class: "habit-tracker-stat" }, `${stats.completionRate}% complete`],
                [
                  "span",
                  { class: "habit-tracker-stat" },
                  `${stats.hitDays}/${stats.totalDays} ${getRenderableHabitIntervals(habit).length > 0 ? "full days" : "days"}`,
                ],
                ["span", { class: "habit-tracker-stat" }, `${stats.currentStreak} day streak`],
              ] satisfies DOMOutputSpec]
            : []),
        ],
        [
          "div",
          { class: "habit-tracker-card-strip" },
          ...dates.map<DOMOutputSpec>((isoDate) => [
            "div",
            {
              class: "habit-tracker-card-day",
              "data-complete": isHabitComplete(
                habit,
                getEntryValue(attrs.entries, habit.id, isoDate)
              )
                ? "true"
                : "false",
            },
            ["span", { class: "habit-tracker-card-day-label" }, getDayOfMonthLabel(isoDate)],
            ["span", { class: "habit-tracker-card-day-value" }, cellSymbolForStatic(habit, attrs.entries, isoDate)],
          ]),
        ],
      ];
    }),
  ];
}

function buildStaticTrackerContent(attrs: HabitTrackerAttrs): DOMOutputSpec[] {
  const visibleRange = getHabitTrackerVisibleRange(
    attrs.preset,
    attrs.anchorDate,
    attrs.weekStartsOn
  );

  const header: DOMOutputSpec = [
    "div",
    { class: "habit-tracker-header" },
    [
      "div",
      { class: "habit-tracker-title-wrap" },
      ["div", { class: "habit-tracker-title" }, attrs.title || "Habit Tracker"],
      ["div", { class: "habit-tracker-subtitle" }, getPresetLabel(attrs.preset)],
      ["div", { class: "habit-tracker-period-label" }, visibleRange.label],
    ],
  ];

  if (attrs.habits.length === 0) {
    return [
      header,
      [
        "div",
        { class: "habit-tracker-empty" },
        ["div", { class: "habit-tracker-empty-title" }, "No habits configured yet"],
        [
          "p",
          { class: "habit-tracker-empty-copy" },
          "Open this document in the app to configure habits and record check-ins.",
        ],
      ],
    ];
  }

  if (attrs.preset === "streak-cards") {
    return [header, buildStaticCards(attrs, visibleRange.dates)];
  }

  return [
    header,
    ...(attrs.showStats ? [buildStaticStatsTable(attrs, visibleRange.dates)] : []),
    buildStaticGrid(attrs, visibleRange.dates),
  ];
}

function getSharedAttributes() {
  return {
    blockId: { default: null },
    blockType: { default: "habitTracker" },
    preset: {
      default: "monthly-grid",
      parseHTML: (el: HTMLElement) => el.getAttribute("data-preset") || "monthly-grid",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-preset": attrs.preset || "monthly-grid" }),
    },
    title: {
      default: "Habit Tracker",
      parseHTML: (el: HTMLElement) => el.getAttribute("data-title") || "Habit Tracker",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-title": attrs.title || "Habit Tracker" }),
    },
    anchorDate: {
      default: "",
      parseHTML: (el: HTMLElement) => el.getAttribute("data-anchor-date") || todayIso(),
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-anchor-date": attrs.anchorDate || todayIso() }),
    },
    weekStartsOn: {
      default: "sunday",
      parseHTML: (el: HTMLElement) => el.getAttribute("data-week-starts-on") || "sunday",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-week-starts-on": attrs.weekStartsOn || "sunday" }),
    },
    showStats: {
      default: true,
      parseHTML: (el: HTMLElement) => el.getAttribute("data-show-stats") !== "false",
      renderHTML: (attrs: Record<string, unknown>) => (attrs.showStats === false ? { "data-show-stats": "false" } : {}),
    },
    showBackground: {
      default: true,
      parseHTML: (el: HTMLElement) => el.getAttribute("data-show-background") !== "false",
      renderHTML: (attrs: Record<string, unknown>) => (attrs.showBackground === false ? { "data-show-background": "false" } : {}),
    },
    showBorder: {
      default: true,
      parseHTML: (el: HTMLElement) => el.getAttribute("data-show-border") !== "false",
      renderHTML: (attrs: Record<string, unknown>) => (attrs.showBorder === false ? { "data-show-border": "false" } : {}),
    },
    habits: {
      default: [],
      parseHTML: (el: HTMLElement) => parseJsonAttribute(el, "data-habits", [] as HabitDefinition[]),
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-habits": JSON.stringify(attrs.habits || []) }),
    },
    entries: {
      default: {},
      parseHTML: (el: HTMLElement) =>
        parseJsonAttribute(el, "data-entries", {} as HabitTrackerEntries),
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-entries": JSON.stringify(attrs.entries || {}) }),
    },
  };
}

export const HabitTracker = Node.create({
  name: "habitTracker",
  group: "block",
  atom: true,

  addAttributes() {
    return getSharedAttributes();
  },

  parseHTML() {
    return [{ tag: 'div[data-block-type="habitTracker"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "block-habit-tracker",
        "data-block-type": "habitTracker",
      }),
    ];
  },

  addNodeView() {
    return createBlockNodeView({
      blockType: "habitTracker",
      label: "Habit Tracker",
      iconName: "CalendarCheck2",
      atom: true,
      containerAttr: "showBorder",
      renderContent(node, contentDom) {
        renderHabitTrackerContent(node, contentDom);
      },
      updateContent(node, contentDom) {
        renderHabitTrackerContent(node, contentDom);
        return true;
      },
    });
  },
});

export const ServerHabitTracker = Node.create({
  name: "habitTracker",
  group: "block",
  atom: true,

  addAttributes() {
    return getSharedAttributes();
  },

  parseHTML() {
    return [{ tag: 'div[data-block-type="habitTracker"]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const attrs = resolveTrackerAttrs(node.attrs as Record<string, unknown>);
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "block-habit-tracker habit-tracker-static",
        "data-block-type": "habitTracker",
        "data-preset": attrs.preset,
        "data-show-background": attrs.showBackground ? "true" : "false",
      }),
      ...buildStaticTrackerContent(attrs),
    ];
  },
});

export function createDefaultHabitTrackerAttrs() {
  return {
    ...habitTrackerDefaults(),
    anchorDate: todayIso(),
  };
}

export function coerceHabitTrackerModeChange(
  entries: HabitTrackerEntries,
  habitId: string,
  nextMode: HabitDefinition["valueMode"],
  target: number
) {
  return coerceHabitEntriesForMode(entries, habitId, nextMode, target);
}

export function getHabitTrackerMarkdownLines(attrs: HabitTrackerAttrs): string[] {
  const visibleRange = getHabitTrackerVisibleRange(
    attrs.preset,
    attrs.anchorDate,
    attrs.weekStartsOn
  );

  const lines: string[] = [
    `## ${attrs.title || "Habit Tracker"}`,
    "",
    `${getPresetLabel(attrs.preset)} • ${visibleRange.label}`,
    "",
  ];

  if (attrs.habits.length === 0) {
    lines.push("_No habits configured_");
  } else if (attrs.preset === "streak-cards") {
    for (const habit of attrs.habits) {
      const stats = getHabitCompletionStats(habit, attrs.entries, visibleRange.dates);
      const strip = visibleRange.dates
        .map((isoDate) => `${getDayOfMonthLabel(isoDate)}:${cellSymbolForStatic(habit, attrs.entries, isoDate)}`)
        .join(" ");
      lines.push(
        `- ${getIconTextFallback(habit.icon, "•")} ${habit.name}: ${strip} | ${stats.completionRate}% | ${stats.currentStreak} streak`
      );
    }
  } else {
    const showIntervalColumn = attrs.habits.some(
      (habit) => getRenderableHabitIntervals(habit).length > 0
    );
    const header = [
      "Habit",
      ...(showIntervalColumn ? ["Time"] : []),
      ...visibleRange.dates.map((isoDate) => getDayOfMonthLabel(isoDate)),
    ];
    if (attrs.showStats) header.push("Stats");
    lines.push(`| ${header.join(" | ")} |`);
    lines.push(`| ${header.map(() => "---").join(" | ")} |`);

    for (const habit of attrs.habits) {
      const stats = getHabitCompletionStats(habit, attrs.entries, visibleRange.dates);
      const intervals = getRenderableHabitIntervals(habit);
      const rowCount = Math.max(1, intervals.length);
      for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
        const interval = intervals[rowIndex];
        const row = [
          rowIndex === 0 ? `${getIconTextFallback(habit.icon, "•")} ${habit.name}` : " ",
          ...(showIntervalColumn ? [interval ? formatHabitIntervalLabel(interval) : " "] : []),
          ...visibleRange.dates.map((isoDate) =>
            cellSymbolForStatic(
              habit,
              attrs.entries,
              isoDate,
              interval ? interval.id : undefined
            )
          ),
        ];
        if (attrs.showStats) {
          row.push(
            rowIndex === 0 ? `${stats.completionRate}% / ${stats.currentStreak} streak` : " "
          );
        }
        lines.push(`| ${row.join(" | ")} |`);
      }
    }
  }

  lines.push("");
  lines.push(
    `<!-- habit-tracker:${JSON.stringify({
      preset: attrs.preset,
      anchorDate: attrs.anchorDate,
      weekStartsOn: attrs.weekStartsOn,
      showStats: attrs.showStats,
      habits: attrs.habits,
      entries: attrs.entries,
    })} -->`
  );

  return lines;
}

export function getHabitTrackerPlainText(attrs: HabitTrackerAttrs): string {
  const visibleRange = getHabitTrackerVisibleRange(
    attrs.preset,
    attrs.anchorDate,
    attrs.weekStartsOn
  );

  const lines = [
    attrs.title || "Habit Tracker",
    `${getPresetLabel(attrs.preset)} — ${visibleRange.label}`,
  ];

  if (attrs.habits.length === 0) {
    lines.push("No habits configured.");
    return lines.join("\n");
  }

  for (const habit of attrs.habits) {
    const stats = getHabitCompletionStats(habit, attrs.entries, visibleRange.dates);
    const days = visibleRange.dates
      .map(
        (isoDate) =>
          `${formatDisplayDate(isoDate, { month: "short", day: "numeric" })}: ${getHabitDaySummaryText(
            habit,
            attrs.entries,
            isoDate
          )}`
      )
      .join(", ");
    lines.push(
      `${getIconTextFallback(habit.icon, "•")} ${habit.name} — ${stats.completionRate}% complete, ${stats.currentStreak} day streak, ${days}`
    );
  }

  return lines.join("\n");
}
