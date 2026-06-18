/**
 * StatsTable Block — Publishing Block
 *
 * Atom block: a vertical key/value list for presenting structured outcomes,
 * case study results, or mixed-unit metrics.
 *
 * Value types per row:
 * - "text"    — plain string (default)
 * - "pills"   — comma-separated inline pill badges
 * - "rating"  — dot scale ("4" = 4/5, "4/5", "7/10")
 * - "boolean" — ✓ / ✗ with semantic color (true/yes/false/no)
 *
 * Attrs:
 * - caption    optional heading above the table
 * - items      JSON string: [{label, value, valueType?, highlight?}]
 * - variant    default | striped | bordered | compact | featured
 * - pillColor  neutral | blue | green | amber | purple | rose | teal | pastel | rainbow
 * - showBorder boolean — hides the block chrome border when false
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { z } from "zod";
import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import { blockIdAttr, dataAttr } from "@/lib/domain/blocks/data-attr";
import { createBlockNodeView } from "@/lib/domain/blocks/node-view-factory";
import { makeWrapAttrs } from "@/lib/domain/blocks/wrap-size";

// ─── Types ────────────────────────────────────────────────────────────────────

export type StatsValueType = "text" | "pills" | "rating" | "boolean";

export interface StatsTableItem {
  label: string;
  value: string;
  valueType?: StatsValueType;
  highlight?: boolean;
}

// ─── Value parsers ────────────────────────────────────────────────────────────

function parseItems(raw: string): StatsTableItem[] {
  try { return JSON.parse(raw) as StatsTableItem[]; } catch { return []; }
}

function parsePills(value: string | undefined | null): string[] {
  if (!value) return [];
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

function parseRating(value: string): { filled: number; total: number } {
  const m = /^(\d+(?:\.\d+)?)(?:\/(\d+))?$/.exec(value.trim());
  if (!m) return { filled: 0, total: 5 };
  const filled = parseFloat(m[1]);
  const total = m[2] ? parseInt(m[2]) : 5;
  return { filled: Math.min(filled, total), total: Math.max(total, 1) };
}

function parseBool(value: string): boolean {
  return /^(true|yes|1|✓|y|on)$/i.test(value.trim());
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const ITEMS_TOOLTIP =
  "Value types: Text (plain), Pills (comma-separated chips), Rating (4 or 4/5 or 7/10 → dot scale), Yes/No (true/false/yes/no → ✓ ✗).";

const { schema: statsTableSchema, defaults: statsTableDefaults } = createBlockSchema(
  "statsTable",
  {
    caption: z.string().default("").describe("Optional heading displayed above the stats table"),
    items: z
      .string()
      .default("[]")
      .describe('JSON array of stats. Each item: {"label":"Cost","value":"$100","valueType":"text","highlight":false}')
      .meta({
        fieldType: "json-array",
        tooltip: ITEMS_TOOLTIP,
        addLabel: "Add stat",
        emptyMessage: "No stats yet — click Add stat",
        jsonArraySchema: [
          { key: "label", label: "Label", type: "text", placeholder: "Cost", required: true },
          {
            key: "value",
            label: "Value",
            type: "text",
            placeholder: "$100",
            required: true,
            tooltip: "Text, comma-separated (pills), 4 or 4/5 (rating), true/false (yes/no)",
          },
          {
            key: "valueType",
            label: "Value type",
            type: "select",
            tooltip: ITEMS_TOOLTIP,
            options: [
              { value: "text", label: "Text" },
              { value: "pills", label: "Pills (comma-separated)" },
              { value: "rating", label: "Rating (dot scale)" },
              { value: "boolean", label: "Yes / No" },
            ],
          },
          {
            key: "highlight",
            label: "Highlight row",
            type: "select",
            options: [
              { value: "false", label: "Normal" },
              { value: "true", label: "Highlighted" },
            ],
          },
        ],
      }),
    variant: z.enum(["default", "striped", "bordered", "compact", "featured"]).default("default"),
    pillColor: z
      .enum(["neutral", "blue", "green", "amber", "purple", "rose", "teal", "pastel", "rainbow"])
      .default("neutral")
      .describe("Color theme applied to pill badges and ratings"),
    showBorder: z
      .boolean()
      .default(true)
      .describe("Show or hide the block chrome border"),
  }
);

registerBlock({
  type: "statsTable",
  label: "Stats Table",
  description: "Vertical key/value list for case study outcomes and mixed-unit metrics",
  iconName: "Table2",
  family: "content",
  group: "publishing",
  contentModel: null,
  atom: true,
  attrsSchema: statsTableSchema,
  defaultAttrs: statsTableDefaults(),
  slashCommand: "/stats-table",
  searchTerms: ["stats", "table", "outcomes", "case study", "results", "kv", "key value", "metrics", "facts", "pills", "skills", "tools"],
});

// ─── Shared attrs ─────────────────────────────────────────────────────────────

function statsTableAttrs() {
  return {
    blockId: blockIdAttr,
    blockType: { default: "statsTable" },
    caption: dataAttr("caption", { default: "" }),
    items: dataAttr("items", { default: "[]" }),
    variant: dataAttr("variant", { default: "default" }),
    pillColor: dataAttr("pill-color", { default: "neutral" }),
    showBorder: {
      default: true,
      parseHTML: (el: Element) => el.getAttribute("data-show-border") !== "false",
      renderHTML: (a: Record<string, unknown>) => ({ "data-show-border": String(a.showBorder) }),
    },
    ...makeWrapAttrs(),
  };
}

// ─── Editor preview HTML (uses CSS vars for theme/dark-mode) ─────────────────

function pillsHtml(value: string): string {
  return parsePills(value)
    .map((p) => `<span style="display:inline-block;padding:1px 8px;margin:1px 3px 1px 0;border-radius:999px;font-size:11px;font-weight:500;background:var(--st-pill-bg);color:var(--st-pill-color);border:1px solid var(--st-pill-border);white-space:nowrap">${p}</span>`)
    .join("");
}

function ratingHtml(value: string): string {
  const { filled, total } = parseRating(value);
  const dots = Array.from({ length: total }, (_, i) =>
    `<span style="color:${i < filled ? "var(--st-pill-color)" : "var(--st-border)"}">●</span>`
  ).join("");
  return `<span style="display:inline-flex;gap:2px;font-size:13px;letter-spacing:1px">${dots}</span>`;
}

function booleanHtml(value: string): string {
  const isTrue = parseBool(value);
  return isTrue
    ? `<span style="color:#16a34a;font-size:15px;font-weight:600">✓</span>`
    : `<span style="color:#dc2626;font-size:15px;font-weight:600">✗</span>`;
}

function renderValueContent(item: StatsTableItem, isHighlight: boolean, variant: string): string {
  switch (item.valueType) {
    case "pills":
      return `<span style="display:flex;flex-wrap:wrap;gap:2px;align-items:center">${pillsHtml(item.value)}</span>`;
    case "rating":
      return ratingHtml(item.value);
    case "boolean":
      return booleanHtml(item.value);
    default: {
      const emphasize = isHighlight || variant === "featured";
      return `<span style="font-weight:${emphasize ? "600" : "400"};color:${emphasize ? "var(--st-value-color-hi)" : "var(--st-value-color)"}">${item.value}</span>`;
    }
  }
}

function editorHtml(items: StatsTableItem[], variant: string, caption: string): string {
  if (items.length === 0) {
    return `
      <div style="padding:20px;border:1px dashed var(--st-dashed-border);border-radius:8px;text-align:center">
        <p style="margin:0 0 4px;font-size:13px;font-weight:500;color:var(--st-empty-title)">Stats Table</p>
        <p style="margin:0;font-size:12px;color:var(--st-empty-hint)">Add stats via Properties (⋯)</p>
        <p style="margin:6px 0 0;font-size:11px;color:var(--st-schema-hint);font-family:monospace">{"label":"Skills","value":"React, TypeScript","valueType":"pills"}</p>
      </div>`;
  }

  const isBordered = variant === "bordered";
  const isCompact = variant === "compact";
  // compact variant tightens via inline override; S/M sizes use CSS vars set on parent .block-node
  const padding = isCompact ? "4px 8px" : "var(--st-padding)";
  const wrapStyle = isBordered
    ? `border:1px solid var(--st-border);border-radius:8px;overflow:hidden`
    : `border-top:1px solid var(--st-border)`;

  const rows = items.map((item, i) => {
    const isStriped = variant === "striped" && i % 2 === 1;
    const isHighlight = item.highlight === true;
    const bg = isHighlight ? "var(--st-row-bg-hi)" : isStriped ? "var(--st-row-bg-alt)" : "var(--st-row-bg)";
    const borderBottom = i < items.length - 1 ? `border-bottom:1px solid var(--st-border);` : "";
    const valueContent = renderValueContent(item, isHighlight, variant);
    const alignItems = item.valueType === "pills" || item.valueType === "rating" ? "center" : "baseline";
    return `
      <div style="display:flex;align-items:${alignItems};padding:${padding};${borderBottom}background:${bg}">
        <span style="flex:0 0 var(--st-label-width);font-size:12px;font-weight:500;color:var(--st-label-color);text-transform:uppercase;letter-spacing:0.04em;padding-right:8px">${item.label}</span>
        <span style="flex:1;font-size:13px">${valueContent}</span>
      </div>`;
  }).join("");

  const captionHtml = caption
    ? `<p style="margin:0 0 8px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--st-caption-color)">${caption}</p>`
    : "";

  return `
    ${captionHtml}
    <div style="${wrapStyle}">${rows}</div>
    <p style="margin:4px 0 0;font-size:11px;color:var(--st-caption-color)">${items.length} stat${items.length === 1 ? "" : "s"} · ${variant}</p>`;
}

// ─── Client extension ─────────────────────────────────────────────────────────

export const StatsTable = Node.create({
  name: "statsTable",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes: statsTableAttrs,

  parseHTML() {
    return [{ tag: 'div[data-block-type="statsTable"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { class: "block-stats-table", "data-block-type": "statsTable" }),
    ];
  },

  addNodeView() {
    return createBlockNodeView({
      blockType: "statsTable",
      label: "Stats Table",
      iconName: "Table2",
      atom: true,
      supportWrap: true,
      containerAttr: "showBorder",
      renderContent(node, contentDom) {
        contentDom.className = "block-stats-table-editor";
        const a = node.attrs as Record<string, string>;
        if (a.pillColor && a.pillColor !== "neutral") {
          contentDom.setAttribute("data-pill-color", a.pillColor);
        }
        contentDom.innerHTML = editorHtml(parseItems(a.items), a.variant, a.caption);
      },
      updateContent(node, contentDom) {
        const a = node.attrs as Record<string, string>;
        if (a.pillColor && a.pillColor !== "neutral") {
          contentDom.setAttribute("data-pill-color", a.pillColor);
        } else {
          contentDom.removeAttribute("data-pill-color");
        }
        contentDom.innerHTML = editorHtml(parseItems(a.items), a.variant, a.caption);
        return true;
      },
    });
  },
});

// ─── Server extension ─────────────────────────────────────────────────────────

export const ServerStatsTable = Node.create({
  name: "statsTable",
  group: "block",
  atom: true,

  addAttributes: statsTableAttrs,

  parseHTML() {
    return [{ tag: 'div[data-block-type="statsTable"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const items = parseItems(HTMLAttributes["data-items"] ?? "[]");
    const variant = (HTMLAttributes["data-variant"] ?? "default") as string;
    const caption = (HTMLAttributes["data-caption"] ?? "") as string;
    const pillColor = (HTMLAttributes["data-pill-color"] ?? "neutral") as string;

    const pillClass = pillColor !== "neutral"
      ? `block-stats-table-pill block-stats-table-pill--${pillColor}`
      : "block-stats-table-pill";

    const rows = items.map((item) => {
      const isPills = item.valueType === "pills";
      const isRating = item.valueType === "rating";
      const rowClass = [
        "block-stats-table-row",
        item.highlight ? "block-stats-table-row--highlight" : "",
        isPills ? "block-stats-table-row--pills" : "",
        isRating ? "block-stats-table-row--rating" : "",
      ].filter(Boolean).join(" ");

      let valueChildren: unknown[];
      if (isPills) {
        valueChildren = parsePills(item.value).map((p) => ["span", { class: pillClass }, p]);
      } else if (isRating) {
        const { filled, total } = parseRating(item.value);
        const dotClass = `block-stats-table-dot block-stats-table-dot--${pillColor !== "neutral" ? pillColor : "default"}`;
        valueChildren = [
          ["span", { class: "block-stats-table-rating" },
            ...Array.from({ length: total }, (_, i) =>
              ["span", { class: i < filled ? `${dotClass} block-stats-table-dot--filled` : dotClass }, "●"]
            ),
          ],
        ];
      } else if (item.valueType === "boolean") {
        const yes = parseBool(item.value);
        valueChildren = [["span", { class: `block-stats-table-bool block-stats-table-bool--${yes ? "yes" : "no"}` }, yes ? "✓" : "✗"]];
      } else {
        valueChildren = [item.value];
      }

      return [
        "li",
        { class: rowClass },
        ["span", { class: "block-stats-table-label" }, item.label],
        ["span", { class: "block-stats-table-value" }, ...valueChildren],
      ];
    });

    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: `block-stats-table block-stats-table--${variant}`,
        "data-block-type": "statsTable",
      }),
      ...(caption ? [["p", { class: "block-stats-table-caption" }, caption]] : []),
      ...(items.length > 0
        ? [["ul", { class: "block-stats-table-list" }, ...rows]]
        : [["p", { class: "block-stats-table-empty" }, "No stats"]]),
    ];
  },
});
