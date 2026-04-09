import { Node, mergeAttributes } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { z } from "zod";
import { createBlockNodeView } from "@/lib/domain/blocks/node-view-factory";
import { registerBlock } from "@/lib/domain/blocks/registry";
import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { useCalendarStore } from "@/extensions/calendar/state/calendar-store";
import { useLeftPanelViewStore } from "@/state/left-panel-view-store";
import { CALENDAR_VIEW_KEY } from "../manifest";
import type { CalendarEventDTO, CalendarWorkspaceResponse } from "../server/types";

const HOUR_START = 6;
const HOUR_END = 20;

type CalendarBlockView = "month" | "week" | "day" | "agenda";
type AgendaRange = "day" | "week";

const { schema: calendarViewBlockSchema, defaults: calendarViewBlockDefaults } =
  createBlockSchema("calendarViewBlock", {
    title: z.string().default("Calendar").describe("Block title"),
    view: z.enum(["month", "week", "day", "agenda"]).default("month").describe("Calendar view"),
    date: z.string().default(() => toDateKey(new Date())).describe("Anchor date in YYYY-MM-DD format"),
    agendaRange: z.enum(["day", "week"]).default("day").describe("Agenda context"),
    sourceIds: z
      .array(z.string())
      .default([])
      .describe("Pinned calendar source IDs, one per line. Empty means all visible sources."),
    heightPx: z.number().int().min(220).max(900).default(420).describe("Maximum block height in pixels"),
    showWeekends: z.boolean().default(true).describe("Show Saturday and Sunday"),
    showEvents: z.boolean().default(true).describe("Show events"),
    showBorder: z.boolean().default(false).describe("Show border"),
  });

registerBlock({
  type: "calendarViewBlock",
  label: "Calendar View",
  description: "Mini calendar block with month, week, day, and agenda views",
  iconName: "CalendarDays",
  family: "content",
  group: "display",
  contentModel: null,
  atom: true,
  attrsSchema: calendarViewBlockSchema,
  defaultAttrs: calendarViewBlockDefaults(),
  slashCommand: "/calendar-view",
  searchTerms: ["calendar", "month", "week", "day", "agenda", "schedule"],
});

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function parseDateKey(value: unknown) {
  if (typeof value !== "string") return new Date();
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return new Date();
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function startOfWeek(date: Date) {
  return addDays(date, -date.getDay());
}

function endOfWeekExclusive(date: Date) {
  return addDays(startOfWeek(date), 7);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonthExclusive(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

function getSourceIds(value: unknown) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(/[\n,]/)
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return [];
}

function getView(value: unknown): CalendarBlockView {
  return value === "week" || value === "day" || value === "agenda" ? value : "month";
}

function getAgendaRange(value: unknown): AgendaRange {
  return value === "week" ? "week" : "day";
}

function eventOccursOnDay(event: CalendarEventDTO, day: Date) {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const dayEnd = addDays(dayStart, 1);
  return new Date(event.startAt) < dayEnd && new Date(event.endAt) > dayStart;
}

function formatTime(event: CalendarEventDTO) {
  if (event.allDay) return "All day";
  return new Date(event.startAt).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTimeRange(event: CalendarEventDTO) {
  if (event.allDay) return "All day";
  return `${formatTime(event)} - ${new Date(event.endAt).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

function rangeForAttrs(attrs: Record<string, unknown>) {
  const view = getView(attrs.view);
  const date = parseDateKey(attrs.date);
  if (view === "month") {
    const monthStart = startOfMonth(date);
    return { start: startOfWeek(monthStart), end: addDays(endOfWeekExclusive(endOfMonthExclusive(date)), 0) };
  }
  if (view === "week" || (view === "agenda" && getAgendaRange(attrs.agendaRange) === "week")) {
    return { start: startOfWeek(date), end: endOfWeekExclusive(date) };
  }
  return { start: new Date(date.getFullYear(), date.getMonth(), date.getDate()), end: addDays(date, 1) };
}

function updateAttrs(
  editor: Editor,
  getPos: (() => number | undefined) | undefined,
  attrs: Record<string, unknown>,
  patch: Record<string, unknown>
) {
  const nodePos = getPos?.();
  if (nodePos === undefined) return;
  editor.view.dispatch(editor.state.tr.setNodeMarkup(nodePos, undefined, { ...attrs, ...patch }));
}

function openCalendarEvent(eventId: string) {
  useCalendarStore.getState().selectEvent(eventId);
  useLeftPanelViewStore.getState().setActiveView(CALENDAR_VIEW_KEY);
}

async function fetchCalendarRange(attrs: Record<string, unknown>) {
  const { start, end } = rangeForAttrs(attrs);
  const response = await fetch(
    `/api/calendar/bootstrap?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(
      end.toISOString()
    )}`
  );
  const result = (await response.json()) as {
    success: boolean;
    data?: CalendarWorkspaceResponse;
    error?: string;
  };

  if (!response.ok || !result.success || !result.data) {
    throw new Error(result.error || "Failed to load calendar block");
  }

  return result.data.events;
}

function titleFor(view: CalendarBlockView, date: Date, agendaRange: AgendaRange): string {
  if (view === "month") return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  if (view === "week") {
    const start = startOfWeek(date);
    const end = addDays(start, 6);
    return `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} - ${end.toLocaleDateString(
      undefined,
      { month: "short", day: "numeric" }
    )}`;
  }
  if (view === "agenda" && agendaRange === "week") return `Agenda: ${titleFor("week", date, agendaRange)}`;
  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function displayTitle(attrs: Record<string, unknown>) {
  const view = getView(attrs.view);
  const date = parseDateKey(attrs.date);
  const agendaRange = getAgendaRange(attrs.agendaRange);
  const title = typeof attrs.title === "string" ? attrs.title.trim() : "";
  const dateTitle = titleFor(view, date, agendaRange);
  return title && title !== "Calendar" ? `${title} · ${dateTitle}` : dateTitle;
}

function defaultWidthForView(view: CalendarBlockView) {
  if (view === "week") return 672;
  if (view === "month") return 432;
  return 416;
}

function navigateDate(attrs: Record<string, unknown>, direction: -1 | 1) {
  const view = getView(attrs.view);
  const date = parseDateKey(attrs.date);
  if (view === "month") return toDateKey(addMonths(date, direction));
  if (view === "week" || (view === "agenda" && getAgendaRange(attrs.agendaRange) === "week")) {
    return toDateKey(addDays(date, direction * 7));
  }
  return toDateKey(addDays(date, direction));
}

function filteredEvents(attrs: Record<string, unknown>, events: CalendarEventDTO[]) {
  const sourceIds = getSourceIds(attrs.sourceIds);
  return events.filter((event) => sourceIds.length === 0 || sourceIds.includes(event.sourceId));
}

function appendEventPill(parent: HTMLElement, event: CalendarEventDTO, compact = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = compact ? "calendar-view-block-event compact" : "calendar-view-block-event";
  button.style.borderLeftColor = event.source.color;
  button.textContent = compact ? event.title : `${formatTime(event)} ${event.title}`;
  button.title = `${formatTimeRange(event)} ${event.title}`;
  button.addEventListener("click", (click) => {
    click.preventDefault();
    click.stopPropagation();
    openCalendarEvent(event.id);
  });
  parent.appendChild(button);
}

function renderToolbar(
  node: ProseMirrorNode,
  editor: Editor,
  getPos: (() => number | undefined) | undefined,
  root: HTMLElement
) {
  const view = getView(node.attrs.view);

  const toolbar = document.createElement("div");
  toolbar.className = "calendar-view-block-toolbar";

  const nav = document.createElement("div");
  nav.className = "calendar-view-block-nav";
  for (const [label, direction] of [
    ["‹", -1],
    ["›", 1],
  ] as const) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "calendar-view-block-nav-button";
    button.textContent = label;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      updateAttrs(editor, getPos, node.attrs, { date: navigateDate(node.attrs, direction) });
    });
    nav.appendChild(button);
  }

  const title = document.createElement("div");
  title.className = "calendar-view-block-title";
  title.textContent = displayTitle(node.attrs);

  const tabs = document.createElement("div");
  tabs.className = "calendar-view-block-tabs";
  for (const nextView of ["month", "week", "day", "agenda"] as CalendarBlockView[]) {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = nextView === view ? "calendar-view-block-tab active" : "calendar-view-block-tab";
    tab.textContent = nextView[0].toUpperCase() + nextView.slice(1);
    tab.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      updateAttrs(editor, getPos, node.attrs, { view: nextView });
    });
    tabs.appendChild(tab);
  }

  toolbar.append(nav, title, tabs);
  root.appendChild(toolbar);
}

function renderMonth(
  root: HTMLElement,
  attrs: Record<string, unknown>,
  events: CalendarEventDTO[],
  editor: Editor,
  getPos: (() => number | undefined) | undefined
) {
  const date = parseDateKey(attrs.date);
  const monthStart = startOfMonth(date);
  const first = startOfWeek(monthStart);
  const showWeekends = attrs.showWeekends !== false;
  const weekdays = showWeekends ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] : ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const grid = document.createElement("div");
  grid.className = `calendar-view-block-month-grid cols-${weekdays.length}`;

  for (const dayName of weekdays) {
    const head = document.createElement("div");
    head.className = "calendar-view-block-weekday";
    head.textContent = dayName;
    grid.appendChild(head);
  }

  for (let index = 0; index < 42; index++) {
    const day = addDays(first, index);
    if (!showWeekends && (day.getDay() === 0 || day.getDay() === 6)) continue;
    const cell = document.createElement("div");
    cell.className = day.getMonth() === date.getMonth() ? "calendar-view-block-month-day" : "calendar-view-block-month-day muted";
    const number = document.createElement("div");
    number.className = "calendar-view-block-day-number";
    number.textContent = String(day.getDate());
    number.title = `Set block date to ${toDateKey(day)}`;
    number.setAttribute("role", "button");
    number.tabIndex = 0;
    number.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      updateAttrs(editor, getPos, attrs, { date: toDateKey(day), view: "day" });
    });
    cell.appendChild(number);

    if (attrs.showEvents !== false) {
      const dayEvents = events.filter((event) => eventOccursOnDay(event, day)).slice(0, 3);
      for (const event of dayEvents) appendEventPill(cell, event, true);
    }
    grid.appendChild(cell);
  }

  root.appendChild(grid);
}

function renderDay(root: HTMLElement, attrs: Record<string, unknown>, events: CalendarEventDTO[]) {
  const date = parseDateKey(attrs.date);
  const shell = document.createElement("div");
  shell.className = "calendar-view-block-day-view";

  const header = document.createElement("div");
  header.className = "calendar-view-block-day-header";
  header.textContent = date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  shell.appendChild(header);

  for (let hour = HOUR_START; hour <= HOUR_END; hour++) {
    const row = document.createElement("div");
    row.className = "calendar-view-block-hour-row";
    const label = document.createElement("div");
    label.className = "calendar-view-block-hour-label";
    label.textContent = new Date(2000, 0, 1, hour).toLocaleTimeString(undefined, { hour: "numeric" });
    const lane = document.createElement("div");
    lane.className = "calendar-view-block-hour-lane";
    for (const event of events.filter((candidate) => eventOccursOnDay(candidate, date))) {
      const eventHour = new Date(event.startAt).getHours();
      if (event.allDay || eventHour !== hour) continue;
      appendEventPill(lane, event);
    }
    row.append(label, lane);
    shell.appendChild(row);
  }
  root.appendChild(shell);
}

function renderWeek(root: HTMLElement, attrs: Record<string, unknown>, events: CalendarEventDTO[]) {
  const date = parseDateKey(attrs.date);
  const weekStart = startOfWeek(date);
  const showWeekends = attrs.showWeekends !== false;
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)).filter(
    (day) => showWeekends || (day.getDay() !== 0 && day.getDay() !== 6)
  );
  const grid = document.createElement("div");
  grid.className = `calendar-view-block-week-grid cols-${days.length}`;
  for (const day of days) {
    const column = document.createElement("div");
    column.className = "calendar-view-block-week-day";
    const head = document.createElement("div");
    head.className = "calendar-view-block-week-head";
    head.textContent = day.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    column.appendChild(head);
    for (const event of events.filter((candidate) => eventOccursOnDay(candidate, day)).slice(0, 8)) {
      appendEventPill(column, event);
    }
    grid.appendChild(column);
  }
  root.appendChild(grid);
}

function renderAgenda(root: HTMLElement, attrs: Record<string, unknown>, events: CalendarEventDTO[]) {
  const date = parseDateKey(attrs.date);
  const range = getAgendaRange(attrs.agendaRange);
  const days = range === "week" ? Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(date), index)) : [date];
  const list = document.createElement("div");
  list.className = "calendar-view-block-agenda";
  for (const day of days) {
    const section = document.createElement("div");
    section.className = "calendar-view-block-agenda-section";
    const header = document.createElement("div");
    header.className = "calendar-view-block-agenda-date";
    header.textContent = day.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
    section.appendChild(header);
    const dayEvents = events.filter((event) => eventOccursOnDay(event, day));
    if (dayEvents.length === 0) {
      const empty = document.createElement("div");
      empty.className = "calendar-view-block-empty";
      empty.textContent = "No events";
      section.appendChild(empty);
    } else {
      for (const event of dayEvents) appendEventPill(section, event);
    }
    list.appendChild(section);
  }
  root.appendChild(list);
}

function renderShell(
  node: ProseMirrorNode,
  contentDom: HTMLElement,
  editor: Editor,
  getPos: (() => number | undefined) | undefined,
  options: { events?: CalendarEventDTO[]; isLoading?: boolean; error?: string | null } = {}
) {
  contentDom.innerHTML = "";
  contentDom.className = "block-content calendar-view-block-content";
  const view = getView(node.attrs.view);
  const showBorder = node.attrs.showBorder === true;
  const events = filteredEvents(node.attrs, options.events || []);
  const root = document.createElement("div");
  root.className = showBorder ? `calendar-view-block-shell view-${view}` : `calendar-view-block-shell view-${view} no-frame`;
  const widthPx = Number(node.attrs.widthPx) || defaultWidthForView(view);
  const heightPx = Number(node.attrs.heightPx) || 420;
  root.style.width = `${widthPx}px`;
  if (view === "month") {
    root.style.maxHeight = "";
    root.style.height = "";
  } else {
    root.style.maxHeight = `${heightPx}px`;
    root.style.height = `${heightPx}px`;
  }

  renderToolbar(node, editor, getPos, root);

  const body = document.createElement("div");
  body.className = "calendar-view-block-body";
  if (options.error) {
    const error = document.createElement("div");
    error.className = "calendar-view-block-error";
    error.textContent = options.error;
    body.appendChild(error);
  } else {
    if (view === "month") renderMonth(body, node.attrs, events, editor, getPos);
    if (view === "day") renderDay(body, node.attrs, events);
    if (view === "week") renderWeek(body, node.attrs, events);
    if (view === "agenda") renderAgenda(body, node.attrs, events);
    if (options.isLoading) {
      const loading = document.createElement("div");
      loading.className = "calendar-view-block-loading";
      loading.textContent = "Loading events...";
      body.appendChild(loading);
    }
  }
  root.appendChild(body);

  const resizeHandle = document.createElement("div");
  resizeHandle.className = "calendar-view-block-resize-handle";
  resizeHandle.title = "Resize calendar";
  resizeHandle.contentEditable = "false";
  resizeHandle.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startY = event.clientY;
    const startWidth = root.getBoundingClientRect().width;
    const startHeight = root.getBoundingClientRect().height;
    const boundary =
      root.closest(".block-column-cell, .block-column, .block-tab-panel-content, .block-accordion-body") ||
      root.closest(".ProseMirror");
    const maxWidth = Math.max(260, (boundary as HTMLElement | null)?.clientWidth ?? window.innerWidth);

    const onMouseMove = (moveEvent: MouseEvent) => {
      const nextWidth = Math.min(maxWidth, Math.max(260, startWidth + (moveEvent.clientX - startX)));
      root.style.width = `${Math.round(nextWidth)}px`;
      if (view !== "month") {
        const nextHeight = Math.min(900, Math.max(220, startHeight + (moveEvent.clientY - startY)));
        root.style.height = `${Math.round(nextHeight)}px`;
        root.style.maxHeight = `${Math.round(nextHeight)}px`;
      }
    };

    const onMouseUp = (upEvent: MouseEvent) => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";

      const nextWidth = Math.min(maxWidth, Math.max(260, startWidth + (upEvent.clientX - startX)));
      const patch: Record<string, unknown> = {
        widthPx: Math.round(nextWidth),
      };

      if (view !== "month") {
        const nextHeight = Math.min(900, Math.max(220, startHeight + (upEvent.clientY - startY)));
        patch.heightPx = Math.round(nextHeight);
      }

      updateAttrs(editor, getPos, node.attrs, patch);
    };

    document.body.style.cursor = "nwse-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  });
  root.appendChild(resizeHandle);
  contentDom.appendChild(root);
}

function renderCalendarViewBlock(
  node: ProseMirrorNode,
  contentDom: HTMLElement,
  editor: Editor,
  getPos?: () => number | undefined
) {
  const requestId = crypto.randomUUID();
  contentDom.dataset.calendarViewRequest = requestId;
  renderShell(node, contentDom, editor, getPos, { isLoading: node.attrs.showEvents !== false });
  if (node.attrs.showEvents === false) return;

  void fetchCalendarRange(node.attrs)
    .then((events) => {
      if (contentDom.dataset.calendarViewRequest !== requestId) return;
      renderShell(node, contentDom, editor, getPos, { events });
    })
    .catch((error) => {
      if (contentDom.dataset.calendarViewRequest !== requestId) return;
      renderShell(node, contentDom, editor, getPos, {
        error: error instanceof Error ? error.message : "Failed to load calendar block",
      });
    });
}

const calendarViewBlockAttributes = {
  blockId: { default: null },
  blockType: { default: "calendarViewBlock" },
  title: { default: "Calendar" },
  view: { default: "month" },
  date: { default: toDateKey(new Date()) },
  agendaRange: { default: "day" },
  sourceIds: { default: [] },
  widthPx: { default: 0 },
  heightPx: { default: 420 },
  showWeekends: { default: true },
  showEvents: { default: true },
  showBorder: { default: false },
};

export const CalendarViewBlock = Node.create({
  name: "calendarViewBlock",
  group: "block",
  atom: true,

  addAttributes() {
    return calendarViewBlockAttributes;
  },

  parseHTML() {
    return [{ tag: 'div[data-block-type="calendarViewBlock"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "block-calendar-view",
        "data-block-type": "calendarViewBlock",
      }),
    ];
  },

  addNodeView() {
    return createBlockNodeView({
      blockType: "calendarViewBlock",
      label: "Calendar View",
      iconName: "CalendarDays",
      atom: true,
      containerAttr: "showBorder",
      renderContent: renderCalendarViewBlock,
      updateContent(node, contentDom, editor, getPos) {
        renderCalendarViewBlock(node, contentDom, editor, getPos);
        return true;
      },
    });
  },
});

export const ServerCalendarViewBlock = Node.create({
  name: "calendarViewBlock",
  group: "block",
  atom: true,

  addAttributes() {
    return calendarViewBlockAttributes;
  },

  parseHTML() {
    return [{ tag: 'div[data-block-type="calendarViewBlock"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "block-calendar-view",
        "data-block-type": "calendarViewBlock",
      }),
      `Calendar ${HTMLAttributes.view || "month"} view`,
    ];
  },
});
