"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import * as LucideIcons from "lucide-react";
import { Settings2, Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";

import { IconSelector } from "@/components/content/IconSelector";
import { useBlockStore } from "@/state/block-store";
import {
  coerceHabitEntriesForMode,
  createEvenHabitIntervals,
  createDefaultHabit,
  DEFAULT_HABIT_ICON,
  DEFAULT_STATUS_ICON,
  formatTimeInputValue,
  parseTimeInputValue,
  removeHabitEntries,
  syncHabitIntervalEntries,
  todayIso,
  type HabitDefinition,
  type HabitTrackerAttrs,
  type HabitTrackerEntries,
  type HabitIntervalDefinition,
  type HabitTrackerPreset,
  type HabitWeekStartsOn,
} from "@/lib/domain/habit-tracker";
import { createDefaultHabitTrackerAttrs } from "@/lib/domain/editor/extensions/blocks/habit-tracker";

const HALF_HOUR_TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const hour24 = Math.floor(index / 2);
  const minute = index % 2 === 0 ? 0 : 30;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const meridiem = hour24 >= 12 ? "P" : "A";
  const value = `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return {
    value,
    label: `${hour12}${minute === 0 ? "" : ":30"}${meridiem}`,
  };
});

function dispatchAttrChange(blockId: string, key: string, value: unknown) {
  window.dispatchEvent(
    new CustomEvent("block-attrs-change", {
      detail: { blockId, key, value },
    })
  );
}

const PRESET_OPTIONS: Array<{ value: HabitTrackerPreset; label: string }> = [
  { value: "monthly-grid", label: "Monthly Grid" },
  { value: "weekly-grid", label: "Weekly Grid" },
  { value: "streak-cards", label: "Streak Cards" },
];

const WEEK_START_OPTIONS: Array<{ value: HabitWeekStartsOn; label: string }> = [
  { value: "sunday", label: "Sunday" },
  { value: "monday", label: "Monday" },
];

function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

function HabitField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function panelInputClassName() {
  return "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none";
}

function HabitIconPreview({
  icon,
  className,
}: {
  icon: string | null | undefined;
  className?: string;
}) {
  if (icon?.startsWith("emoji:")) {
    return <span className={className}>{icon.replace("emoji:", "")}</span>;
  }

  if (icon?.startsWith("lucide:")) {
    const iconName = icon.replace("lucide:", "");
    const LucideIcon = (
      LucideIcons as unknown as Record<string, ComponentType<{ className?: string }>>
    )[iconName];
    if (LucideIcon) {
      return <LucideIcon className={className} />;
    }
  }

  return <span className={className}>{icon || "•"}</span>;
}

function HabitIconPicker({
  label,
  value,
  onChange,
  compact = false,
}: {
  label: string;
  value: string;
  onChange: (nextValue: string) => void;
  compact?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [triggerPosition, setTriggerPosition] = useState({ x: 0, y: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);

  const button = (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          if (buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setTriggerPosition({ x: rect.left, y: rect.bottom + 4 });
          }
          setIsOpen(true);
        }}
        className={
          compact
            ? "flex h-8 w-8 items-center justify-center rounded-md bg-transparent text-slate-700 transition-colors hover:bg-slate-100 focus:outline-none"
            : "flex w-full items-center gap-2 rounded-md border border-slate-300 bg-white px-2 py-2 text-left text-sm text-slate-900 transition-colors hover:border-blue-400 hover:bg-slate-50 focus:outline-none"
        }
      >
        <span className={compact ? "flex items-center justify-center text-slate-700" : "flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 text-slate-700"}>
          <HabitIconPreview icon={value} className="h-4 w-4" />
        </span>
        {compact ? null : <span className="truncate text-slate-500">Choose icon</span>}
      </button>
      <IconSelector
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSelectIcon={onChange}
        currentIcon={value || null}
        triggerPosition={triggerPosition}
        iconOnly
      />
    </>
  );

  if (compact) {
    return button;
  }

  return <HabitField label={label}>{button}</HabitField>;
}

export function HabitTrackerPropertiesPanel() {
  const selectedBlockId = useBlockStore((state) => state.selectedBlockId);
  const selectedBlockType = useBlockStore((state) => state.selectedBlockType);
  const initialAttrs = useMemo(
    () => ({
      ...createDefaultHabitTrackerAttrs(),
      anchorDate: todayIso(),
    }),
    []
  );

  const [attrs, setAttrs] = useState<HabitTrackerAttrs>(
    initialAttrs as HabitTrackerAttrs
  );

  useEffect(() => {
    if (selectedBlockType !== "habitTracker") {
      setAttrs(initialAttrs as HabitTrackerAttrs);
    }
  }, [initialAttrs, selectedBlockType]);

  useEffect(() => {
    const handleAttrsUpdate = (event: Event) => {
      const detail = (event as CustomEvent).detail as {
        blockId?: string;
        attrs?: HabitTrackerAttrs;
      };
      if (detail.blockId !== selectedBlockId || !detail.attrs) return;
      setAttrs((current) => ({
        ...current,
        ...detail.attrs,
      }));
    };

    window.addEventListener("block-attrs-update", handleAttrsUpdate);
    return () =>
      window.removeEventListener("block-attrs-update", handleAttrsUpdate);
  }, [selectedBlockId]);

  if (!selectedBlockId || selectedBlockType !== "habitTracker") {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center opacity-50">
        <Settings2 className="mb-3 h-8 w-8" />
        <p className="text-sm">Select a habit tracker to edit its settings</p>
      </div>
    );
  }

  const updateAttr = <K extends keyof HabitTrackerAttrs>(
    key: K,
    value: HabitTrackerAttrs[K]
  ) => {
    setAttrs((current) => ({ ...current, [key]: value }));
    dispatchAttrChange(selectedBlockId, key as string, value);
  };

  const updateHabits = (
    nextHabits: HabitDefinition[],
    nextEntries?: HabitTrackerEntries
  ) => {
    setAttrs((current) => ({
      ...current,
      habits: nextHabits,
      ...(nextEntries ? { entries: nextEntries } : {}),
    }));
    dispatchAttrChange(selectedBlockId, "habits", nextHabits);
    if (nextEntries) {
      dispatchAttrChange(selectedBlockId, "entries", nextEntries);
    }
  };

  const addHabit = () => {
    updateHabits([...attrs.habits, createDefaultHabit(attrs.habits.length)]);
  };

  const removeHabit = (habitId: string) => {
    updateHabits(
      attrs.habits.filter((habit) => habit.id !== habitId),
      removeHabitEntries(attrs.entries, habitId)
    );
  };

  const updateHabit = (
    habitId: string,
    patch: Partial<HabitDefinition>,
    options?: {
      nextEntries?: HabitTrackerEntries;
    }
  ) => {
    const nextHabits = attrs.habits.map((habit) =>
      habit.id === habitId ? { ...habit, ...patch } : habit
    );
    updateHabits(nextHabits, options?.nextEntries);
  };

  const updateHabitIntervals = (
    habit: HabitDefinition,
    nextIntervalMode: HabitDefinition["intervalMode"],
    nextIntervals: HabitIntervalDefinition[]
  ) => {
    const normalizedIntervals = createEvenHabitIntervals(nextIntervals.length || 1).map(
      (fallbackInterval, index) => ({
        id: nextIntervals[index]?.id || fallbackInterval.id,
        startMinute: nextIntervals[index]?.startMinute ?? fallbackInterval.startMinute,
        endMinute: nextIntervals[index]?.endMinute ?? fallbackInterval.endMinute,
      })
    );
    const nextEntries = syncHabitIntervalEntries(
      attrs.entries,
      habit,
      nextIntervalMode,
      normalizedIntervals
    );
    updateHabit(
      habit.id,
      {
        intervalMode: nextIntervalMode,
        intervals: normalizedIntervals,
      },
      { nextEntries }
    );
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b border-slate-200 px-4 py-3">
        <h3 className="text-sm font-medium text-slate-900">Habit Tracker</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          Presets, period controls, and habit definitions
        </p>
      </div>

      <div className="space-y-6 px-4 py-3">
        <section className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
            General
          </div>

          <HabitField label="Title">
            <input
              className={panelInputClassName()}
              type="text"
              value={attrs.title}
              onChange={(event) => updateAttr("title", event.target.value)}
              placeholder="Habit Tracker"
            />
          </HabitField>

          <div className="grid grid-cols-2 gap-3">
            <HabitField label="Preset">
              <select
                className={panelInputClassName()}
                value={attrs.preset}
                onChange={(event) =>
                  updateAttr("preset", event.target.value as HabitTrackerPreset)
                }
              >
                {PRESET_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </HabitField>

            <HabitField label="Week Starts">
              <select
                className={panelInputClassName()}
                value={attrs.weekStartsOn}
                onChange={(event) =>
                  updateAttr(
                    "weekStartsOn",
                    event.target.value as HabitWeekStartsOn
                  )
                }
              >
                {WEEK_START_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </HabitField>
          </div>

          <HabitField label="Anchor Date">
            <input
              className={panelInputClassName()}
              type="date"
              value={attrs.anchorDate}
              onChange={(event) => updateAttr("anchorDate", event.target.value)}
            />
          </HabitField>

          <div className="space-y-3 pt-2">
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input
                checked={attrs.showStats}
                onChange={(event) => updateAttr("showStats", event.target.checked)}
                type="checkbox"
              />
              Show stats
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input
                checked={attrs.showBackground}
                onChange={(event) =>
                  updateAttr("showBackground", event.target.checked)
                }
                type="checkbox"
              />
              Show background
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input
                checked={attrs.showBorder}
                onChange={(event) => updateAttr("showBorder", event.target.checked)}
                type="checkbox"
              />
              Show border
            </label>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
              Habits
            </div>
            <button
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 transition-colors hover:border-blue-400 hover:bg-slate-50"
              onClick={addHabit}
              type="button"
            >
              <Plus className="h-3.5 w-3.5" />
              Add habit
            </button>
          </div>

          {attrs.habits.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500">
              No habits yet. Add one to populate the tracker.
            </div>
          ) : null}

          <div className="space-y-4">
            {attrs.habits.map((habit, index) => (
              <div
                key={habit.id}
                className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    <input
                      aria-label="Icon color"
                      className="h-9 w-2.5 shrink-0 cursor-pointer appearance-none rounded-full border border-slate-300 bg-transparent p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0 [&::-moz-color-swatch]:rounded-full [&::-moz-color-swatch]:border-0"
                      type="color"
                      value={habit.color}
                      onChange={(event) =>
                        updateHabit(habit.id, { color: event.target.value })
                      }
                    />
                    <div className="shrink-0">
                      <HabitIconPicker
                        label="Icon"
                        compact
                        value={habit.icon && habit.icon !== "•" ? habit.icon : DEFAULT_HABIT_ICON}
                        onChange={(nextValue) => updateHabit(habit.id, { icon: nextValue })}
                      />
                    </div>
                    <input
                      className="min-w-0 flex-1 bg-transparent text-lg font-semibold leading-tight text-slate-950 placeholder:text-slate-400 focus:outline-none"
                      type="text"
                      value={habit.name}
                      onChange={(event) =>
                        updateHabit(habit.id, { name: event.target.value })
                      }
                      placeholder={`Habit ${index + 1}`}
                    />
                  </div>
                  <div className="-mr-1 ml-auto flex shrink-0 items-center gap-0.5">
                    <button
                      className="flex h-5 w-5 items-center justify-center text-slate-400 transition-colors hover:text-slate-700 disabled:opacity-30"
                      disabled={index === 0}
                      onClick={() =>
                        updateHabits(moveItem(attrs.habits, index, index - 1))
                      }
                      type="button"
                    >
                      <ArrowUp className="h-3 w-3" />
                    </button>
                    <button
                      className="flex h-5 w-5 items-center justify-center text-slate-400 transition-colors hover:text-slate-700 disabled:opacity-30"
                      disabled={index === attrs.habits.length - 1}
                      onClick={() =>
                        updateHabits(moveItem(attrs.habits, index, index + 1))
                      }
                      type="button"
                    >
                      <ArrowDown className="h-3 w-3" />
                    </button>
                    <button
                      className="flex h-5 w-5 items-center justify-center text-slate-400 transition-colors hover:text-red-600"
                      onClick={() => removeHabit(habit.id)}
                      type="button"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                <HabitField label="Value Mode">
                  <select
                    className={panelInputClassName()}
                    value={habit.valueMode}
                    onChange={(event) => {
                      const nextMode = event.target.value as HabitDefinition["valueMode"];
                      const nextEntries = coerceHabitEntriesForMode(
                        attrs.entries,
                        habit.id,
                        nextMode,
                        habit.target
                      );
                      updateHabit(
                        habit.id,
                        {
                          valueMode: nextMode,
                          statusIcon: habit.statusIcon || DEFAULT_STATUS_ICON,
                          target: nextMode === "count" ? habit.target || 1 : 1,
                          unit: nextMode === "count" ? habit.unit : "",
                        },
                        { nextEntries }
                      );
                    }}
                  >
                    <option value="boolean">Boolean</option>
                    <option value="status">3 State</option>
                    <option value="count">Count</option>
                  </select>
                </HabitField>

                <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] items-end gap-3">
                  <div className="min-w-0">
                    <HabitField label="Time Intervals">
                      <div className="grid grid-cols-2 gap-2 rounded-md border border-slate-300 bg-white p-2">
                        <label className="flex min-w-0 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-2 text-sm text-slate-800">
                          <input
                            checked={habit.intervalMode === "split"}
                            onChange={(event) => {
                              const enabled = event.target.checked;
                              updateHabitIntervals(
                                habit,
                                enabled ? "split" : "single",
                                enabled
                                  ? habit.intervals?.length > 1
                                    ? habit.intervals
                                    : createEvenHabitIntervals(2)
                                  : habit.intervals
                              );
                            }}
                            type="checkbox"
                          />
                          <span className="min-w-0 leading-tight">Split into time slots</span>
                        </label>
                        <label className="flex min-w-0 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-2 text-sm text-slate-700">
                          <input
                            checked={habit.showIntervalTimes !== false}
                            disabled={habit.intervalMode !== "split"}
                            onChange={(event) =>
                              updateHabit(habit.id, {
                                showIntervalTimes: event.target.checked,
                              })
                            }
                            type="checkbox"
                          />
                          <span className="min-w-0 leading-tight">Show time labels</span>
                        </label>
                      </div>
                    </HabitField>
                  </div>

                  <div className="w-full">
                    <HabitField label="Rows">
                      <select
                        className={panelInputClassName()}
                        disabled={habit.intervalMode !== "split"}
                        value={habit.intervalMode === "split" ? String(habit.intervals.length || 1) : "1"}
                        onChange={(event) => {
                          const count = Math.max(1, Number(event.target.value) || 1);
                          updateHabitIntervals(habit, habit.intervalMode, createEvenHabitIntervals(count));
                        }}
                      >
                        <option value="1">1</option>
                        <option value="2">2</option>
                        <option value="3">3</option>
                        <option value="4">4</option>
                        <option value="5">5</option>
                        <option value="6">6</option>
                      </select>
                    </HabitField>
                  </div>
                </div>

                {habit.intervalMode === "split" ? (
                  <div className="space-y-2">
                    {habit.intervals.map((interval, intervalIndex) => (
                      <div
                        key={interval.id}
                        className="grid grid-cols-[3.5rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-2"
                      >
                        <span className="text-xs font-medium text-slate-500">
                          Row {intervalIndex + 1}
                        </span>
                        <select
                          className={`${panelInputClassName()} text-sm`}
                          value={formatTimeInputValue(interval.startMinute)}
                          onChange={(event) => {
                            const nextIntervals = habit.intervals.map((currentInterval) =>
                              currentInterval.id === interval.id
                                ? {
                                    ...currentInterval,
                                    startMinute: parseTimeInputValue(event.target.value),
                                  }
                                : currentInterval
                            );
                            updateHabitIntervals(habit, habit.intervalMode, nextIntervals);
                          }}
                        >
                          {HALF_HOUR_TIME_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <select
                          className={`${panelInputClassName()} text-sm`}
                          value={formatTimeInputValue(interval.endMinute)}
                          onChange={(event) => {
                            const nextIntervals = habit.intervals.map((currentInterval) =>
                              currentInterval.id === interval.id
                                ? {
                                    ...currentInterval,
                                    endMinute: parseTimeInputValue(event.target.value),
                                  }
                                : currentInterval
                            );
                            updateHabitIntervals(habit, habit.intervalMode, nextIntervals);
                          }}
                        >
                          {HALF_HOUR_TIME_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                ) : null}

                {habit.valueMode === "status" ? (
                  <HabitIconPicker
                    label="Third State Icon"
                    value={habit.statusIcon || DEFAULT_STATUS_ICON}
                    onChange={(nextValue) =>
                      updateHabit(habit.id, { statusIcon: nextValue })
                    }
                  />
                ) : null}

                {habit.valueMode === "count" ? (
                  <div className="grid grid-cols-2 gap-3">
                    <HabitField label="Daily Target">
                      <input
                        className={panelInputClassName()}
                        min={1}
                        type="number"
                        value={habit.target}
                        onChange={(event) => {
                          const target = Math.max(1, Number(event.target.value) || 1);
                          const nextEntries = coerceHabitEntriesForMode(
                            attrs.entries,
                            habit.id,
                            habit.valueMode,
                            target
                          );
                          updateHabit(habit.id, { target }, { nextEntries });
                        }}
                      />
                    </HabitField>

                    <HabitField label="Unit Label">
                      <input
                        className={panelInputClassName()}
                        type="text"
                        value={habit.unit}
                        onChange={(event) =>
                          updateHabit(habit.id, { unit: event.target.value })
                        }
                        placeholder="glasses, reps, pages"
                      />
                    </HabitField>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
