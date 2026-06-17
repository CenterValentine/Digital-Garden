/**
 * StatsTable Block — Publishing Block
 *
 * Atom block: a vertical key/value list for presenting structured outcomes,
 * case study results, or mixed-unit metrics (e.g. "Cost: $100", "Savings: 90 hrs/wk").
 *
 * Attrs:
 * - caption  optional heading above the table
 * - items    JSON string: [{label, value, highlight?}]
 * - variant  default | striped | bordered | compact | featured
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { z } from "zod";
import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import { blockIdAttr, dataAttr } from "@/lib/domain/blocks/data-attr";
import { createBlockNodeView } from "@/lib/domain/blocks/node-view-factory";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StatsTableItem {
  label: string;
  value: string;
  highlight?: boolean;
}

function parseItems(raw: string): StatsTableItem[] {
  try { return JSON.parse(raw) as StatsTableItem[]; } catch { return []; }
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const { schema: statsTableSchema, defaults: statsTableDefaults } = createBlockSchema(
  "statsTable",
  {
    caption: z.string().default("").describe("Optional heading displayed above the stats table"),
    items: z
      .string()
      .default("[]")
      .describe('JSON array of stats. Each item: {"label":"Cost","value":"$100","highlight":false}')
      .meta({
        fieldType: "json-array",
        addLabel: "Add stat",
        emptyMessage: "No stats yet — click Add stat",
        jsonArraySchema: [
          { key: "label", label: "Label", type: "text", placeholder: "Cost", required: true },
          { key: "value", label: "Value", type: "text", placeholder: "$100", required: true },
          { key: "highlight", label: "Highlight row", type: "select", options: [
            { value: "false", label: "Normal" },
            { value: "true", label: "Highlighted" },
          ]},
        ],
      }),
    variant: z.enum(["default", "striped", "bordered", "compact", "featured"]).default("default"),
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
  searchTerms: ["stats", "table", "outcomes", "case study", "results", "kv", "key value", "metrics", "facts"],
});

// ─── Shared attrs ─────────────────────────────────────────────────────────────

function statsTableAttrs() {
  return {
    blockId: blockIdAttr,
    blockType: { default: "statsTable" },
    caption: dataAttr("caption", { default: "" }),
    items: dataAttr("items", { default: "[]" }),
    variant: dataAttr("variant", { default: "default" }),
  };
}

// ─── Editor preview HTML ──────────────────────────────────────────────────────

function editorHtml(items: StatsTableItem[], variant: string, caption: string): string {
  if (items.length === 0) {
    return `
      <div style="padding:20px;border:1px dashed #d1d5db;border-radius:8px;text-align:center">
        <p style="margin:0 0 4px;font-size:13px;font-weight:500;color:#374151">Stats Table</p>
        <p style="margin:0;font-size:12px;color:#9ca3af">Add stats via Properties (⋯)</p>
        <p style="margin:6px 0 0;font-size:11px;color:#d1d5db;font-family:monospace">{"label":"Cost","value":"$100"}</p>
      </div>
    `;
  }

  const isBordered = variant === "bordered";
  const isCompact = variant === "compact";
  const padding = isCompact ? "6px 8px" : "10px 12px";
  const wrapStyle = isBordered
    ? "border:1px solid #e5e7eb;border-radius:8px;overflow:hidden"
    : "border-top:1px solid #e5e7eb";

  const rows = items.map((item, i) => {
    const isStriped = variant === "striped" && i % 2 === 1;
    const isHighlight = item.highlight === true;
    const bg = isHighlight
      ? "#eff6ff"
      : isStriped ? "#f9fafb" : "#fff";
    const valueFontWeight = isHighlight || variant === "featured" ? "600" : "400";
    const valueColor = isHighlight || variant === "featured" ? "#1d4ed8" : "#111827";
    const borderBottom = i < items.length - 1 ? "border-bottom:1px solid #f3f4f6;" : "";
    return `
      <div style="display:flex;align-items:baseline;padding:${padding};${borderBottom}background:${bg}">
        <span style="flex:0 0 45%;font-size:12px;font-weight:500;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;padding-right:8px">${item.label}</span>
        <span style="flex:1;font-size:13px;font-weight:${valueFontWeight};color:${valueColor}">${item.value}</span>
      </div>
    `;
  }).join("");

  const captionHtml = caption
    ? `<p style="margin:0 0 8px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:#9ca3af">${caption}</p>`
    : "";

  return `
    ${captionHtml}
    <div style="${wrapStyle}">${rows}</div>
    <p style="margin:4px 0 0;font-size:11px;color:#9ca3af">${items.length} stat${items.length === 1 ? "" : "s"} · ${variant}</p>
  `;
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
      renderContent(node, contentDom) {
        contentDom.className = "block-stats-table-editor";
        const a = node.attrs as Record<string, string>;
        contentDom.innerHTML = editorHtml(parseItems(a.items), a.variant, a.caption);
      },
      updateContent(node, contentDom) {
        const a = node.attrs as Record<string, string>;
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

    const rows = items.map((item) => [
      "li",
      {
        class: [
          "block-stats-table-row",
          item.highlight ? "block-stats-table-row--highlight" : "",
        ].filter(Boolean).join(" "),
      },
      ["span", { class: "block-stats-table-label" }, item.label],
      ["span", { class: "block-stats-table-value" }, item.value],
    ]);

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
