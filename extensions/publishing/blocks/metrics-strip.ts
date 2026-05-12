/**
 * MetricsStrip Block — W4 Publishing Block
 *
 * Atom block: a horizontal strip of multiple metrics / KPIs.
 * Items stored as JSON string.
 *
 * Attrs:
 * - items    JSON string: [{value, label, prefix?, suffix?, trend?}]
 *            trend: "up" | "down" | "flat"
 * - variant  bar | cards | inline | minimal
 * - dividers show vertical dividers between items
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { z } from "zod";
import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import { createBlockNodeView } from "@/lib/domain/blocks/node-view-factory";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MetricItem {
  value: string;
  label: string;
  prefix?: string;
  suffix?: string;
  trend?: "up" | "down" | "flat";
}

function parseItems(raw: string): MetricItem[] {
  try { return JSON.parse(raw) as MetricItem[]; } catch { return []; }
}

const TREND_SYMBOLS: Record<string, string> = { up: "↑", down: "↓", flat: "→" };
const TREND_COLORS: Record<string, string> = { up: "#16a34a", down: "#dc2626", flat: "#9ca3af" };

// ─── Schema ──────────────────────────────────────────────────────────────────

const { schema: metricsStripSchema, defaults: metricsStripDefaults } = createBlockSchema(
  "metricsStrip",
  {
    items: z
      .string()
      .default("[]")
      .describe('JSON array of metrics. Each item: {"value":"2.4M","label":"Users","prefix":"$","suffix":"%","trend":"up"}')
      .meta({
        fieldType: "json-array",
        addLabel: "Add metric",
        emptyMessage: "No metrics yet — click Add metric",
        jsonArraySchema: [
          { key: "value", label: "Value", type: "text", placeholder: "2.4M", required: true },
          { key: "label", label: "Label", type: "text", placeholder: "Total users", required: true },
          { key: "prefix", label: "Prefix", type: "text", placeholder: "$" },
          { key: "suffix", label: "Suffix", type: "text", placeholder: "%" },
          { key: "trend", label: "Trend", type: "select", options: [
            { value: "", label: "None" },
            { value: "up", label: "↑ Up (positive)" },
            { value: "down", label: "↓ Down (negative)" },
            { value: "flat", label: "→ Flat (neutral)" },
          ]},
        ],
      }),
    variant: z.enum(["bar", "cards", "inline", "minimal"]).default("bar"),
    dividers: z.boolean().default(true),
  }
);

registerBlock({
  type: "metricsStrip",
  label: "Metrics Strip",
  description: "Horizontal row of metrics and KPIs",
  iconName: "BarChart2",
  family: "content",
  group: "publishing",
  contentModel: null,
  atom: true,
  attrsSchema: metricsStripSchema,
  defaultAttrs: metricsStripDefaults(),
  slashCommand: "/metrics",
  searchTerms: ["metrics", "kpi", "stats", "strip", "row", "numbers", "data"],
});

// ─── Shared attrs ─────────────────────────────────────────────────────────────

function metricsStripAttrs() {
  return {
    blockId: { default: null },
    blockType: { default: "metricsStrip" },
    items: {
      default: "[]",
      parseHTML: (el: Element) => el.getAttribute("data-items") ?? "[]",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-items": attrs.items }),
    },
    variant: {
      default: "bar",
      parseHTML: (el: Element) => el.getAttribute("data-variant") ?? "bar",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-variant": attrs.variant }),
    },
    dividers: {
      default: true,
      parseHTML: (el: Element) => el.getAttribute("data-dividers") !== "false",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-dividers": attrs.dividers }),
    },
  };
}

function editorHtml(items: MetricItem[], variant: string): string {
  if (items.length === 0) {
    return `
      <div style="padding:20px;border:1px dashed #d1d5db;border-radius:8px;text-align:center">
        <p style="margin:0 0 4px;font-size:13px;font-weight:500;color:#374151">Metrics Strip</p>
        <p style="margin:0;font-size:12px;color:#9ca3af">Add metrics via Properties (⋯)</p>
        <p style="margin:6px 0 0;font-size:11px;color:#d1d5db;font-family:monospace">{"value":"2.4M","label":"Users","trend":"up"}</p>
      </div>
    `;
  }

  return `
    <div style="display:flex;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
      ${items.map((item, i) => `
        <div style="flex:1;padding:16px;text-align:center;${i > 0 ? "border-left:1px solid #e5e7eb;" : ""}background:#fff">
          <div style="font-size:24px;font-weight:700;color:#111827;line-height:1">
            ${item.prefix ?? ""}${item.value}${item.suffix ?? ""}${item.trend ? `<span style="font-size:13px;color:${TREND_COLORS[item.trend] ?? "#9ca3af"};margin-left:2px">${TREND_SYMBOLS[item.trend] ?? ""}</span>` : ""}
          </div>
          <div style="font-size:11px;color:#6b7280;margin-top:5px">${item.label}</div>
        </div>
      `).join("")}
    </div>
    <p style="margin:6px 0 0;font-size:11px;color:#9ca3af">${items.length} metric${items.length === 1 ? "" : "s"} · ${variant}</p>
  `;
}

// ─── Client extension ─────────────────────────────────────────────────────────

export const MetricsStrip = Node.create({
  name: "metricsStrip",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes: metricsStripAttrs,

  parseHTML() {
    return [{ tag: 'div[data-block-type="metricsStrip"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { class: "block-metrics-strip", "data-block-type": "metricsStrip" }),
    ];
  },

  addNodeView() {
    return createBlockNodeView({
      blockType: "metricsStrip",
      label: "Metrics Strip",
      iconName: "BarChart2",
      atom: true,
      renderContent(node, contentDom) {
        contentDom.className = "block-metrics-strip-editor";
        contentDom.innerHTML = editorHtml(
          parseItems(node.attrs.items as string),
          node.attrs.variant as string,
        );
      },
      updateContent(node, contentDom) {
        contentDom.innerHTML = editorHtml(
          parseItems(node.attrs.items as string),
          node.attrs.variant as string,
        );
        return true;
      },
    });
  },
});

// ─── Server extension ─────────────────────────────────────────────────────────

export const ServerMetricsStrip = Node.create({
  name: "metricsStrip",
  group: "block",
  atom: true,

  addAttributes: metricsStripAttrs,

  parseHTML() {
    return [{ tag: 'div[data-block-type="metricsStrip"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const items = parseItems(HTMLAttributes["data-items"] ?? "[]");
    const variant = (HTMLAttributes["data-variant"] ?? "bar") as string;

    const cells = items.map((item) => {
      const numericMatch = item.value.match(/^(-?[\d.]+)/);
      const numericPart = numericMatch ? numericMatch[1] : null;
      const numericSuffix = numericPart ? item.value.slice(numericPart.length) : "";

      return [
      "div",
      { class: "block-metrics-strip-item" },
      [
        "span",
        { class: "block-metrics-strip-value" },
        ...(item.prefix ? [["span", { class: "block-metrics-strip-prefix" }, item.prefix]] : []),
        [
          "span",
          {
            class: "block-metrics-strip-number",
            ...(numericPart !== null ? {
              "data-count-target": numericPart,
              "data-count-value-suffix": numericSuffix,
            } : {}),
          },
          item.value,
        ],
        ...(item.suffix ? [["span", { class: "block-metrics-strip-suffix" }, item.suffix]] : []),
        ...(item.trend
          ? [[
              "span",
              {
                class: `block-metrics-strip-trend block-metrics-strip-trend--${item.trend}`,
                "aria-label": item.trend,
              },
              TREND_SYMBOLS[item.trend] ?? "",
            ]]
          : []),
      ],
      ["p", { class: "block-metrics-strip-label" }, item.label],
    ];
    });

    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: `block-metrics-strip block-metrics-strip--${variant}`,
        "data-block-type": "metricsStrip",
      }),
      ...(cells.length > 0 ? cells : [["p", { class: "block-metrics-strip-empty" }, "No metrics"]]),
    ];
  },
});
