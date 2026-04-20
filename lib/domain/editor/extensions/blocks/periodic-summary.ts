import { Node, mergeAttributes, type Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { z } from "zod";
import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import { createBlockNodeView } from "@/lib/domain/blocks/node-view-factory";
import {
  clampSummaryCutoffHour,
  getDefaultPeriodicSummaryDate,
  getPeriodicSummaryWindow,
  type PeriodicSummaryKind,
} from "@/lib/domain/periodic-summary";

interface PeriodicSummaryItem {
  id: string;
  title: string;
  contentType: string;
  customIcon: string | null;
  iconColor: string | null;
  fileMimeType: string | null;
  visualizationEngine: string | null;
  createdAt: string;
  updatedAt: string;
  activity: "created" | "edited";
  path: string;
}

const SUMMARY_ICON_PATHS: Record<string, string> = {
  fileText:
    '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  file:
    '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  fileCode:
    '<path d="M10 12.5 8 15l2 2.5"/><path d="m14 12.5 2 2.5-2 2.5"/><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  code: '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
  externalLink:
    '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  messageCircle:
    '<path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"/>',
  barChart:
    '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  network:
    '<rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/><path d="M12 8v4"/>',
  pencil:
    '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  gitBranch:
    '<line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
  video:
    '<path d="m16 13 5.223 3.482A.5.5 0 0 0 22 16.066V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  audio:
    '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  image:
    '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  braces: '<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1"/><path d="M16 21h1a2 2 0 0 0 2-2v-5a2 2 0 0 1 2-2 2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/>',
  spreadsheet:
    '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 13h8"/><path d="M8 17h8"/><path d="M10 9v8"/><path d="M14 9v8"/>',
  archive:
    '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
};

const summaryBaseAttrs = {
  workdayCutoffHour: z
    .number()
    .int()
    .min(0)
    .max(4)
    .default(0)
    .describe("Cutoff from 12 AM through 4 AM for assigning late-night work to the previous day."),
  autoBorrowDurationMinutes: z
    .number()
    .int()
    .min(1)
    .max(1440)
    .default(60)
    .describe("Minutes to auto-borrow opened files when Workplaces is enabled."),
  pathOrder: z
    .enum(["Root > File", "File < Root"])
    .default("Root > File")
    .describe("Display file paths from root to file, or from file back to root."),
  showBackground: z.boolean().default(true).describe("Show background fill"),
  showBorder: z.boolean().default(true).describe("Show border"),
};

const { schema: dailySummarySchema, defaults: dailySummaryDefaults } =
  createBlockSchema("dailySummary", {
    summaryDate: z
      .string()
      .default("")
      .describe("YYYY-MM-DD date summarized by this block."),
    ...summaryBaseAttrs,
  });

const { schema: weeklySummarySchema, defaults: weeklySummaryDefaults } =
  createBlockSchema("weeklySummary", {
    weekStartDate: z
      .string()
      .default("")
      .describe("YYYY-MM-DD Monday that starts the summarized ISO week."),
    ...summaryBaseAttrs,
  });

registerBlock({
  type: "dailySummary",
  label: "Daily Summary",
  description: "Files created or edited during one workday",
  iconName: "ListChecks",
  family: "content",
  group: "display",
  contentModel: null,
  atom: true,
  attrsSchema: dailySummarySchema,
  defaultAttrs: dailySummaryDefaults(),
  slashCommand: "/daily-summary",
  searchTerms: ["daily", "summary", "activity", "created", "edited", "work"],
});

registerBlock({
  type: "weeklySummary",
  label: "Weekly Summary",
  description: "Files created or edited during one ISO week",
  iconName: "ListChecks",
  family: "content",
  group: "display",
  contentModel: null,
  atom: true,
  attrsSchema: weeklySummarySchema,
  defaultAttrs: weeklySummaryDefaults(),
  slashCommand: "/weekly-summary",
  searchTerms: ["weekly", "summary", "activity", "created", "edited", "work"],
});

function getDateKey(kind: PeriodicSummaryKind) {
  return kind === "weekly" ? "weekStartDate" : "summaryDate";
}

function normalizeSummaryAttrs(
  kind: PeriodicSummaryKind,
  attrs: Record<string, unknown>
) {
  const dateKey = getDateKey(kind);
  const cutoffHour = clampSummaryCutoffHour(attrs.workdayCutoffHour);
  const rawDate = String(attrs[dateKey] || "");
  const periodDate =
    rawDate || getDefaultPeriodicSummaryDate(kind, new Date(), cutoffHour);
  const window = getPeriodicSummaryWindow(kind, periodDate, cutoffHour);

  return {
    dateKey,
    cutoffHour,
    periodDate: window.periodDate,
    window,
  };
}

function syncNormalizedAttrs(
  node: ProseMirrorNode,
  editor: Editor,
  getPos: (() => number | undefined) | undefined,
  kind: PeriodicSummaryKind
) {
  if (!getPos) return;
  const pos = getPos();
  if (pos === undefined) return;

  const normalized = normalizeSummaryAttrs(kind, node.attrs);
  const updates: Record<string, unknown> = {};

  if (node.attrs[normalized.dateKey] !== normalized.periodDate) {
    updates[normalized.dateKey] = normalized.periodDate;
  }
  if (node.attrs.workdayCutoffHour !== normalized.cutoffHour) {
    updates.workdayCutoffHour = normalized.cutoffHour;
  }

  if (Object.keys(updates).length === 0) return;

  requestAnimationFrame(() => {
    const currentPos = getPos();
    if (currentPos === undefined) return;
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(currentPos, undefined, {
        ...node.attrs,
        ...updates,
      })
    );
  });
}

function formatActivityTime(value: string, kind: PeriodicSummaryKind) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    weekday: kind === "weekly" ? "short" : undefined,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function getSummaryIconKey(item: PeriodicSummaryItem) {
  if (item.contentType === "file" && item.fileMimeType) {
    const mimeType = item.fileMimeType.toLowerCase();
    if (mimeType.startsWith("video/")) return "video";
    if (mimeType.startsWith("audio/")) return "audio";
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType === "application/json") return "braces";
    if (
      mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      mimeType === "application/vnd.ms-excel" ||
      mimeType === "text/csv"
    ) {
      return "spreadsheet";
    }
    if (
      mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      mimeType === "application/msword"
    ) {
      return "fileText";
    }
    if (mimeType === "application/pdf") return "fileText";
    if (
      mimeType === "application/zip" ||
      mimeType === "application/x-zip-compressed" ||
      mimeType === "application/x-rar-compressed" ||
      mimeType === "application/x-7z-compressed" ||
      mimeType === "application/gzip" ||
      mimeType === "application/x-tar"
    ) {
      return "archive";
    }
  }

  if (item.contentType === "visualization") {
    switch (item.visualizationEngine) {
      case "diagrams-net":
        return "network";
      case "excalidraw":
        return "pencil";
      case "mermaid":
        return "gitBranch";
      default:
        return "barChart";
    }
  }

  switch (item.contentType) {
    case "note":
      return "fileText";
    case "html":
    case "template":
      return "fileCode";
    case "code":
      return "code";
    case "external":
      return "externalLink";
    case "chat":
      return "messageCircle";
    default:
      return "file";
  }
}

function appendSummaryIcon(target: HTMLElement, item: PeriodicSummaryItem) {
  if (item.customIcon?.startsWith("emoji:")) {
    target.textContent = item.customIcon.replace("emoji:", "");
    return;
  }

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = SUMMARY_ICON_PATHS[getSummaryIconKey(item)] ?? SUMMARY_ICON_PATHS.file;
  target.appendChild(svg);
}

function getSummaryTitle(kind: PeriodicSummaryKind, label: string) {
  return kind === "weekly"
    ? `Weekly File Summary for ${label}`
    : `Daily File Summary for ${label}`;
}

function truncatePathFromRoot(path: string, maxLength = 72) {
  if (path.length <= maxLength) return path;

  const segments = path.split(" / ").filter(Boolean);
  const tail: string[] = [];
  let length = 5;

  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index];
    const nextLength = length + segment.length + (tail.length > 0 ? 3 : 0);
    if (tail.length > 0 && nextLength > maxLength) break;
    if (tail.length === 0 && nextLength > maxLength) {
      return `...${segment.slice(-(maxLength - 3))}`;
    }
    tail.unshift(segment);
    length = nextLength;
  }

  return `... / ${tail.join(" / ")}`;
}

function formatPathForDisplay(path: string, pathOrder: unknown) {
  const segments = path.split(" / ").filter(Boolean);
  const order = pathOrder === "File < Root" ? "File < Root" : "Root > File";

  if (order === "File < Root") {
    return segments.reverse().join(" < ");
  }

  return segments.join(" > ");
}

function truncateDisplayPath(path: string, pathOrder: unknown, maxLength = 72) {
  const order = pathOrder === "File < Root" ? "File < Root" : "Root > File";
  const displayPath = formatPathForDisplay(path, order);

  if (displayPath.length <= maxLength) return displayPath;

  if (order === "File < Root") {
    const segments = displayPath.split(" < ");
    const kept: string[] = [];
    let length = 5;

    for (const segment of segments) {
      const nextLength = length + segment.length + (kept.length > 0 ? 3 : 0);
      if (kept.length > 0 && nextLength > maxLength) break;
      if (kept.length === 0 && nextLength > maxLength) {
        return `${segment.slice(0, maxLength - 3)}...`;
      }
      kept.push(segment);
      length = nextLength;
    }

    return `${kept.join(" < ")} < ...`;
  }

  return truncatePathFromRoot(displayPath.replaceAll(" > ", " / "), maxLength)
    .replaceAll(" / ", " > ");
}

function renderSummarySkeleton(
  contentDom: HTMLElement,
  kind: PeriodicSummaryKind,
  label: string,
  showBackground: boolean
) {
  contentDom.innerHTML = "";
  contentDom.classList.add("block-periodic-summary-content");
  contentDom.setAttribute(
    "data-summary-background",
    showBackground ? "visible" : "hidden"
  );

  const header = document.createElement("div");
  header.className = "block-periodic-summary-header";
  header.textContent = getSummaryTitle(kind, label);
  contentDom.appendChild(header);

  const loading = document.createElement("div");
  loading.className = "block-periodic-summary-empty";
  loading.textContent = "Loading activity...";
  contentDom.appendChild(loading);
}

function renderSummaryItems(
  contentDom: HTMLElement,
  kind: PeriodicSummaryKind,
  label: string,
  items: PeriodicSummaryItem[],
  autoBorrowDurationMinutes: number,
  pathOrder: unknown,
  showBackground: boolean
) {
  contentDom.innerHTML = "";
  contentDom.classList.add("block-periodic-summary-content");
  contentDom.setAttribute(
    "data-summary-background",
    showBackground ? "visible" : "hidden"
  );

  const header = document.createElement("div");
  header.className = "block-periodic-summary-header";

  const title = document.createElement("span");
  title.className = "block-periodic-summary-heading";
  title.textContent = getSummaryTitle(kind, label);
  header.appendChild(title);

  const meta = document.createElement("span");
  meta.className = "block-periodic-summary-meta";
  meta.textContent = `${items.length} ${items.length === 1 ? "file" : "files"}`;
  header.appendChild(meta);
  contentDom.appendChild(header);

  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "block-periodic-summary-empty";
    empty.textContent = "No files were created or edited in this period.";
    contentDom.appendChild(empty);
    return;
  }

  const list = document.createElement("div");
  list.className = "block-periodic-summary-list";

  for (const item of items) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "block-periodic-summary-row";
    row.dataset.activity = item.activity;
    row.contentEditable = "false";
    row.title =
      item.activity === "created"
        ? "Created during this period"
        : "Edited during this period";
    row.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void import("./periodic-summary-open").then(({ openPeriodicSummaryContent }) =>
        openPeriodicSummaryContent({
          id: item.id,
          title: item.title,
          contentType: item.contentType,
          autoBorrowDurationMinutes,
        })
      );
    });

    const badge = document.createElement("span");
    badge.className = "block-periodic-summary-type";
    if (item.iconColor) badge.style.color = item.iconColor;
    appendSummaryIcon(badge, item);
    row.appendChild(badge);

    const body = document.createElement("span");
    body.className = "block-periodic-summary-row-body";

    const itemTitle = document.createElement("span");
    itemTitle.className = "block-periodic-summary-title";
    itemTitle.textContent = item.title;
    body.appendChild(itemTitle);

    const itemMeta = document.createElement("span");
    itemMeta.className = "block-periodic-summary-path";
    itemMeta.title = item.path;
    const activityTime = formatActivityTime(
      item.activity === "created" ? item.createdAt : item.updatedAt,
      kind
    );
    const displayPath = truncateDisplayPath(item.path, pathOrder);
    itemMeta.textContent = activityTime
      ? `${displayPath} · ${activityTime}`
      : displayPath;
    body.appendChild(itemMeta);
    row.appendChild(body);

    list.appendChild(row);
  }

  contentDom.appendChild(list);
}

function renderPeriodicSummary(
  kind: PeriodicSummaryKind,
  node: ProseMirrorNode,
  contentDom: HTMLElement,
  editor: Editor,
  getPos?: () => number | undefined
) {
  syncNormalizedAttrs(node, editor, getPos, kind);
  const { window } = normalizeSummaryAttrs(kind, node.attrs);
  const duration = Number(node.attrs.autoBorrowDurationMinutes) || 60;
  const pathOrder = node.attrs.pathOrder || "Root > File";
  const showBackground = node.attrs.showBackground !== false;

  renderSummarySkeleton(contentDom, kind, window.label, showBackground);

  const params = new URLSearchParams({
    start: window.startIso,
    end: window.endIso,
  });

  fetch(`/api/periodic-notes/summary?${params.toString()}`, {
    credentials: "include",
  })
    .then((response) => response.json())
    .then((result) => {
      if (!result?.success) {
        throw new Error(result?.error?.message || "Failed to load activity");
      }
      renderSummaryItems(
        contentDom,
        kind,
        window.label,
        result.data.items as PeriodicSummaryItem[],
        duration,
        pathOrder,
        showBackground
      );
    })
    .catch((error) => {
      contentDom.innerHTML = "";
      contentDom.classList.add("block-periodic-summary-content");
      contentDom.setAttribute(
        "data-summary-background",
        showBackground ? "visible" : "hidden"
      );
      const message = document.createElement("div");
      message.className = "block-periodic-summary-empty";
      message.textContent =
        error instanceof Error ? error.message : "Failed to load activity.";
      contentDom.appendChild(message);
    });
}

function createPeriodicSummaryNode(kind: PeriodicSummaryKind) {
  const name = kind === "weekly" ? "weeklySummary" : "dailySummary";
  const label = kind === "weekly" ? "Weekly Summary" : "Daily Summary";
  const dateKey = getDateKey(kind);

  return Node.create({
    name,
    group: "block",
    atom: true,

    addAttributes() {
      return {
        blockId: { default: null },
        blockType: { default: name },
        [dateKey]: {
          default: "",
          parseHTML: (el) => el.getAttribute(`data-${dateKey}`) || "",
          renderHTML: (attrs) =>
            attrs[dateKey] ? { [`data-${dateKey}`]: attrs[dateKey] } : {},
        },
        workdayCutoffHour: {
          default: 0,
          parseHTML: (el) =>
            clampSummaryCutoffHour(el.getAttribute("data-workday-cutoff-hour")),
          renderHTML: (attrs) => ({
            "data-workday-cutoff-hour": clampSummaryCutoffHour(
              attrs.workdayCutoffHour
            ),
          }),
        },
        autoBorrowDurationMinutes: {
          default: 60,
          parseHTML: (el) =>
            Number(el.getAttribute("data-auto-borrow-duration-minutes") || 60),
          renderHTML: (attrs) => ({
            "data-auto-borrow-duration-minutes":
              Number(attrs.autoBorrowDurationMinutes) || 60,
          }),
        },
        pathOrder: {
          default: "Root > File",
          parseHTML: (el) =>
            el.getAttribute("data-path-order") === "File < Root"
              ? "File < Root"
              : "Root > File",
          renderHTML: (attrs) => ({
            "data-path-order":
              attrs.pathOrder === "File < Root" ? "File < Root" : "Root > File",
          }),
        },
        showBackground: {
          default: true,
          parseHTML: (el) =>
            el.getAttribute("data-show-background") !== "false",
          renderHTML: (attrs) =>
            attrs.showBackground === false
              ? { "data-show-background": "false" }
              : {},
        },
        showBorder: {
          default: true,
          parseHTML: (el) => el.getAttribute("data-show-border") !== "false",
          renderHTML: (attrs) =>
            attrs.showBorder === false ? { "data-show-border": "false" } : {},
        },
      };
    },

    parseHTML() {
      return [{ tag: `div[data-block-type="${name}"]` }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "div",
        mergeAttributes(HTMLAttributes, {
          class: `block-${name}`,
          "data-block-type": name,
        }),
      ];
    },

    addNodeView() {
      return createBlockNodeView({
        blockType: name,
        label,
        iconName: "ListChecks",
        atom: true,
        containerAttr: "showBorder",
        renderContent(node, contentDom, editor, getPos) {
          renderPeriodicSummary(kind, node, contentDom, editor, getPos);
        },
        updateContent(node, contentDom, editor, getPos) {
          renderPeriodicSummary(kind, node, contentDom, editor, getPos);
          return true;
        },
      });
    },
  });
}

function createServerPeriodicSummaryNode(kind: PeriodicSummaryKind) {
  const name = kind === "weekly" ? "weeklySummary" : "dailySummary";
  const dateKey = getDateKey(kind);

  return Node.create({
    name,
    group: "block",
    atom: true,

    addAttributes() {
      return {
        blockId: { default: null },
        blockType: { default: name },
        [dateKey]: {
          default: "",
          parseHTML: (el) => el.getAttribute(`data-${dateKey}`) || "",
          renderHTML: (attrs) =>
            attrs[dateKey] ? { [`data-${dateKey}`]: attrs[dateKey] } : {},
        },
        workdayCutoffHour: {
          default: 0,
          parseHTML: (el) =>
            clampSummaryCutoffHour(el.getAttribute("data-workday-cutoff-hour")),
          renderHTML: (attrs) => ({
            "data-workday-cutoff-hour": clampSummaryCutoffHour(
              attrs.workdayCutoffHour
            ),
          }),
        },
        autoBorrowDurationMinutes: { default: 60 },
        pathOrder: {
          default: "Root > File",
          parseHTML: (el) =>
            el.getAttribute("data-path-order") === "File < Root"
              ? "File < Root"
              : "Root > File",
          renderHTML: (attrs) => ({
            "data-path-order":
              attrs.pathOrder === "File < Root" ? "File < Root" : "Root > File",
          }),
        },
        showBackground: { default: true },
        showBorder: { default: true },
      };
    },

    parseHTML() {
      return [{ tag: `div[data-block-type="${name}"]` }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "div",
        mergeAttributes(HTMLAttributes, {
          class: `block-${name}`,
          "data-block-type": name,
        }),
      ];
    },
  });
}

export const DailySummary = createPeriodicSummaryNode("daily");
export const WeeklySummary = createPeriodicSummaryNode("weekly");
export const ServerDailySummary = createServerPeriodicSummaryNode("daily");
export const ServerWeeklySummary = createServerPeriodicSummaryNode("weekly");
