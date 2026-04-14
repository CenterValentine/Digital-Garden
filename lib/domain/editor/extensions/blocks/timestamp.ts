/**
 * Timestamp Block
 *
 * Inserts today's date as a frozen, non-updating timestamp.
 * The date value is stored as an ISO string and never changes — only
 * the display format (controlled via the Properties side panel) updates.
 *
 * Sprint 65: People + Collab
 */

import { Node, mergeAttributes, type RawCommands } from "@tiptap/core";
import { z } from "zod";
import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import { createBlockNodeView } from "@/lib/domain/blocks/node-view-factory";

const FORMAT_PRESETS = [
  "MMMM D, YYYY",
  "MMM D, YYYY",
  "D MMMM YYYY",
  "MM/DD/YYYY",
  "DD/MM/YYYY",
  "YYYY-MM-DD",
] as const;

type FormatPreset = (typeof FORMAT_PRESETS)[number];

const { schema: timestampSchema, defaults: timestampDefaults } =
  createBlockSchema("timestamp", {
    isoDate: z
      .string()
      .default("")
      .describe("Frozen ISO date string (set at insertion, never updated)"),
    displayFormat: z
      .enum(FORMAT_PRESETS)
      .default("MMMM D, YYYY")
      .describe("Date display format"),
    prefix: z
      .string()
      .default("")
      .describe("Optional text before the date (e.g. 'Dated:')"),
    showContainer: z.boolean().default(false).describe("Show border"),
  });

registerBlock({
  type: "timestamp",
  label: "Timestamp",
  description: "Frozen date stamp — captures today's date at insertion",
  iconName: "CalendarClock",
  family: "content",
  group: "display",
  contentModel: null,
  atom: true,
  attrsSchema: timestampSchema,
  defaultAttrs: timestampDefaults(),
  slashCommand: "/timestamp",
  searchTerms: ["timestamp", "date", "today", "now", "time", "stamp", "datestamp"],
  hiddenFields: ["isoDate"],
});

/** Format an ISO date string using the chosen preset. Pure, no library needed. */
function formatDate(isoDate: string, format: FormatPreset): string {
  if (!isoDate) return "";

  // Parse date parts from ISO string to avoid timezone shifts
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return isoDate;

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1; // 0-indexed
  const day = parseInt(match[3], 10);

  const MONTHS_LONG = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const MONTHS_SHORT = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  const pad2 = (n: number) => String(n).padStart(2, "0");
  const monthLong = MONTHS_LONG[month] ?? "";
  const monthShort = MONTHS_SHORT[month] ?? "";
  const monthNum = month + 1;

  switch (format) {
    case "MMMM D, YYYY":  return `${monthLong} ${day}, ${year}`;
    case "MMM D, YYYY":   return `${monthShort} ${day}, ${year}`;
    case "D MMMM YYYY":   return `${day} ${monthLong} ${year}`;
    case "MM/DD/YYYY":    return `${pad2(monthNum)}/${pad2(day)}/${year}`;
    case "DD/MM/YYYY":    return `${pad2(day)}/${pad2(monthNum)}/${year}`;
    case "YYYY-MM-DD":    return `${year}-${pad2(monthNum)}-${pad2(day)}`;
    default:              return isoDate;
  }
}

export const Timestamp = Node.create({
  name: "timestamp",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      blockId: { default: null },
      blockType: { default: "timestamp" },
      isoDate: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-iso-date") || "",
        renderHTML: (attrs) =>
          attrs.isoDate ? { "data-iso-date": attrs.isoDate } : {},
      },
      displayFormat: {
        default: "MMMM D, YYYY",
        parseHTML: (el) =>
          el.getAttribute("data-display-format") || "MMMM D, YYYY",
        renderHTML: (attrs) => ({ "data-display-format": attrs.displayFormat }),
      },
      prefix: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-prefix") || "",
        renderHTML: (attrs) =>
          attrs.prefix ? { "data-prefix": attrs.prefix } : {},
      },
      showContainer: {
        default: false,
        parseHTML: (el) =>
          el.getAttribute("data-show-container") === "true",
        renderHTML: (attrs) =>
          attrs.showContainer ? { "data-show-container": "true" } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-block-type="timestamp"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "block-timestamp",
        "data-block-type": "timestamp",
      }),
    ];
  },

  addCommands() {
    return {
      insertTimestamp:
        () =>
        ({ commands }: { commands: { insertContent: (c: unknown) => boolean } }) => {
          const today = new Date();
          const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
          return commands.insertContent({
            type: "timestamp",
            attrs: { isoDate: iso },
          });
        },
    } as Partial<RawCommands>;
  },

  addNodeView() {
    return createBlockNodeView({
      blockType: "timestamp",
      label: "Timestamp",
      iconName: "CalendarClock",
      atom: true,
      containerAttr: "showContainer",
      renderContent(node, contentDom) {
        renderTimestamp(node.attrs as Record<string, unknown>, contentDom);
      },
      updateContent(node, contentDom) {
        contentDom.innerHTML = "";
        renderTimestamp(node.attrs as Record<string, unknown>, contentDom);
        return true;
      },
    });
  },
});

function renderTimestamp(
  attrs: Record<string, unknown>,
  contentDom: HTMLElement
) {
  contentDom.classList.add("block-timestamp-content");
  const isoDate = String(attrs.isoDate || "");
  const format = (attrs.displayFormat as FormatPreset) || "MMMM D, YYYY";
  const prefix = String(attrs.prefix || "");
  const formatted = formatDate(isoDate, format);

  if (prefix) {
    const prefixEl = document.createElement("span");
    prefixEl.className = "block-timestamp-prefix";
    prefixEl.textContent = `${prefix} `;
    contentDom.appendChild(prefixEl);
  }

  const dateEl = document.createElement("time");
  dateEl.className = "block-timestamp-date";
  dateEl.setAttribute("datetime", isoDate);
  dateEl.textContent = formatted || isoDate;
  contentDom.appendChild(dateEl);
}

/** Server-safe version — renders HTML for export/API */
export const ServerTimestamp = Node.create({
  name: "timestamp",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      blockId: { default: null },
      blockType: { default: "timestamp" },
      isoDate: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-iso-date") || "",
        renderHTML: (attrs) =>
          attrs.isoDate ? { "data-iso-date": attrs.isoDate } : {},
      },
      displayFormat: {
        default: "MMMM D, YYYY",
        parseHTML: (el) =>
          el.getAttribute("data-display-format") || "MMMM D, YYYY",
        renderHTML: (attrs) => ({ "data-display-format": attrs.displayFormat }),
      },
      prefix: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-prefix") || "",
        renderHTML: (attrs) =>
          attrs.prefix ? { "data-prefix": attrs.prefix } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-block-type="timestamp"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const isoDate = String(HTMLAttributes["data-iso-date"] || "");
    const format = (HTMLAttributes["data-display-format"] as FormatPreset) || "MMMM D, YYYY";
    const prefix = String(HTMLAttributes["data-prefix"] || "");
    const formatted = formatDate(isoDate, format);
    const text = prefix ? `${prefix} ${formatted}` : formatted;

    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "block-timestamp",
        "data-block-type": "timestamp",
      }),
      ["time", { datetime: isoDate, class: "block-timestamp-date" }, text],
    ];
  },
});
