/**
 * Timeline Block — W4 Publishing Block
 *
 * Atom block: ordered list of events with date, title, and optional body.
 * Items stored as JSON string.
 *
 * Attrs:
 * - items    JSON string: [{date, title, body?, icon?, accent?}]
 * - variant  default | minimal | dotted | card | split | ribbon |
 *            compact | numbered | arrow | magazine  (10 variants)
 * - dateFormat  iso | short | year-only | hidden
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { z } from "zod";
import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import { createBlockNodeView } from "@/lib/domain/blocks/node-view-factory";
import { dataAttr } from "@/lib/domain/blocks/data-attr";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TimelineItem {
  date: string;
  title: string;
  body?: string;
  icon?: string;
  accent?: string;
}

function parseItems(raw: string): TimelineItem[] {
  try { return JSON.parse(raw) as TimelineItem[]; } catch { return []; }
}

function formatDate(iso: string, fmt: string, customFmt?: string): string {
  if (!iso || fmt === "hidden") return "";
  if (fmt === "year-only") return iso.slice(0, 4);
  if (fmt === "custom" && customFmt) {
    // Basic Moment.js token substitution (server-side, no moment dependency)
    try {
      const d = new Date(iso);
      const pad = (n: number) => String(n).padStart(2, "0");
      const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
      const shortMonths = months.map((m) => m.slice(0, 3));
      return customFmt
        .replace("MMMM", months[d.getMonth()]!)
        .replace("MMM", shortMonths[d.getMonth()]!)
        .replace("MM", pad(d.getMonth() + 1))
        .replace("M", String(d.getMonth() + 1))
        .replace("YYYY", String(d.getFullYear()))
        .replace("YY", String(d.getFullYear()).slice(-2))
        .replace("DD", pad(d.getDate()))
        .replace("D", String(d.getDate()));
    } catch {
      return iso;
    }
  }
  try {
    const d = new Date(iso);
    return fmt === "short"
      ? d.toLocaleDateString("en-US", { month: "short", year: "numeric" })
      : d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return iso;
  }
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const VARIANTS = [
  "default", "minimal", "dotted", "card", "split",
  "ribbon", "compact", "numbered", "arrow", "magazine",
] as const;

const { schema: timelineSchema, defaults: timelineDefaults } = createBlockSchema(
  "timeline",
  {
    items: z
      .string()
      .default("[]")
      .describe('JSON array of timeline events. Each item: {"date":"2024-06-01","title":"Event name","body":"Optional detail text"}')
      .meta({
        fieldType: "json-array",
        addLabel: "Add event",
        emptyMessage: "No events yet — click Add event",
        jsonArraySchema: [
          { key: "date", label: "Date", type: "date", required: true },
          { key: "title", label: "Title", type: "text", placeholder: "Product launch", required: true },
          { key: "body", label: "Detail", type: "textarea", placeholder: "Shipped to production (optional)" },
        ],
      }),
    variant: z.enum(VARIANTS).default("default"),
    dateFormat: z
      .enum(["iso", "short", "year-only", "hidden", "custom"])
      .default("short")
      .describe("Date display format")
      .meta({ tooltip: "How to display dates. 'custom' uses the format string below." }),
    customDateFormat: z
      .string()
      .default("")
      .describe("Custom date format string (e.g. DD MMM YYYY)")
      .meta({ tooltip: "Moment.js format tokens — e.g. 'MMMM D, YYYY' for 'January 1, 2024'. See momentjs.com/docs/#/displaying/format/" }),
  }
);

registerBlock({
  type: "timeline",
  label: "Timeline",
  description: "Ordered chronology of events — 10 visual variants",
  iconName: "GitCommitHorizontal",
  family: "content",
  group: "publishing",
  contentModel: null,
  atom: true,
  attrsSchema: timelineSchema,
  defaultAttrs: timelineDefaults(),
  slashCommand: "/timeline",
  searchTerms: ["timeline", "history", "events", "chronology", "milestones"],
});

// ─── Shared attrs ─────────────────────────────────────────────────────────────

function timelineAttrs() {
  return {
    blockId: { default: null },
    blockType: { default: "timeline" },
    items: dataAttr("items", { default: "[]" }),
    variant: dataAttr("variant", { default: "default" }),
    dateFormat: dataAttr("dateFormat", { default: "short" }),
    customDateFormat: dataAttr("customDateFormat"),
  };
}

function editorHtml(items: TimelineItem[], variant: string, dateFormat: string, customDateFormat?: string): string {
  if (items.length === 0) {
    return `
      <div style="padding:20px;border:1px dashed #d1d5db;border-radius:8px;text-align:center">
        <p style="margin:0 0 4px;font-size:13px;font-weight:500;color:#374151">Timeline</p>
        <p style="margin:0;font-size:12px;color:#9ca3af">Add events via Properties (⋯)</p>
        <p style="margin:6px 0 0;font-size:11px;color:#d1d5db;font-family:monospace">{"date":"2024-01-15","title":"Event","body":"Detail"}</p>
      </div>
    `;
  }

  return `
    <div style="position:relative;padding-left:24px;border-left:2px solid #e5e7eb">
      ${items.map((item) => {
        const dateStr = formatDate(item.date, dateFormat, customDateFormat);
        const dot = item.accent ?? "#6b7280";
        return `
          <div style="position:relative;margin-bottom:16px;padding-left:12px">
            <div style="position:absolute;left:-25px;top:4px;width:10px;height:10px;border-radius:50%;background:${dot};border:2px solid #fff;box-shadow:0 0 0 1px #e5e7eb"></div>
            ${dateStr ? `<p style="margin:0 0 2px;font-size:11px;color:#9ca3af">${dateStr}</p>` : ""}
            <p style="margin:0;font-size:13px;font-weight:600;color:#111827">${item.title}</p>
            ${item.body ? `<p style="margin:2px 0 0;font-size:12px;color:#6b7280">${item.body}</p>` : ""}
          </div>
        `;
      }).join("")}
    </div>
    <p style="margin:6px 0 0;font-size:11px;color:#9ca3af">${items.length} event${items.length === 1 ? "" : "s"} · ${variant} variant</p>
  `;
}

// ─── Client extension ─────────────────────────────────────────────────────────

export const Timeline = Node.create({
  name: "timeline",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes: timelineAttrs,

  parseHTML() {
    return [{ tag: 'div[data-block-type="timeline"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { class: "block-timeline", "data-block-type": "timeline" }),
    ];
  },

  addNodeView() {
    return createBlockNodeView({
      blockType: "timeline",
      label: "Timeline",
      iconName: "GitCommitHorizontal",
      atom: true,
      renderContent(node, contentDom) {
        contentDom.className = "block-timeline-editor";
        contentDom.innerHTML = editorHtml(
          parseItems(node.attrs.items as string),
          node.attrs.variant as string,
          node.attrs.dateFormat as string,
          node.attrs.customDateFormat as string | undefined,
        );
      },
      updateContent(node, contentDom) {
        contentDom.innerHTML = editorHtml(
          parseItems(node.attrs.items as string),
          node.attrs.variant as string,
          node.attrs.dateFormat as string,
          node.attrs.customDateFormat as string | undefined,
        );
        return true;
      },
    });
  },
});

// ─── Server extension ─────────────────────────────────────────────────────────

export const ServerTimeline = Node.create({
  name: "timeline",
  group: "block",
  atom: true,

  addAttributes: timelineAttrs,

  parseHTML() {
    return [{ tag: 'div[data-block-type="timeline"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const items = parseItems(HTMLAttributes["data-items"] ?? "[]");
    const variant = (HTMLAttributes["data-variant"] ?? "default") as string;
    const dateFormat = (HTMLAttributes["data-date-format"] ?? "short") as string;
    const customDateFormat = (HTMLAttributes["data-custom-date-format"] as string) || undefined;

    const entries = items.map((item, i) => [
      "li",
      { class: "block-timeline-item", "data-index": i },
      ...(formatDate(item.date, dateFormat, customDateFormat)
        ? [["time", { class: "block-timeline-date", datetime: item.date }, formatDate(item.date, dateFormat, customDateFormat)]]
        : []),
      ["h3", { class: "block-timeline-title" }, item.title],
      ...(item.body ? [["p", { class: "block-timeline-body" }, item.body]] : []),
    ]);

    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: `block-timeline block-timeline--${variant}`,
        "data-block-type": "timeline",
      }),
      items.length > 0
        ? ["ol", { class: "block-timeline-list" }, ...entries]
        : ["p", { class: "block-timeline-empty" }, "No events"],
    ];
  },
});
