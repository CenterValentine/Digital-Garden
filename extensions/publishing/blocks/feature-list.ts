/**
 * FeatureList Block — W7 Publishing Block
 *
 * Atom block: a grid of features/benefits, each with an emoji or icon
 * glyph, a heading, and a description.
 *
 * Attrs:
 * - items    JSON string: [{icon, title, description}]
 * - columns  1 | 2 | 3 | 4
 * - variant  default | card | minimal | icon-top | icon-left
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { z } from "zod";
import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import {
  BACKGROUND_SCHEMA_SHAPE,
  backgroundAttrs,
} from "../lib/background-attrs";
import { createBlockNodeView } from "@/lib/domain/blocks/node-view-factory";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FeatureItem {
  icon?: string;
  title: string;
  description?: string;
}

function parseItems(raw: string): FeatureItem[] {
  try { return JSON.parse(raw) as FeatureItem[]; } catch { return []; }
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const VARIANTS = ["default", "card", "minimal", "icon-top", "icon-left"] as const;

const { schema: featureSchema, defaults: featureDefaults } = createBlockSchema(
  "featureList",
  {
    items: z
      .string()
      .default("[]")
      .describe('JSON array of features. Each item: {"icon":"⚡","title":"Fast","description":"Built for speed"}')
      .meta({
        fieldType: "json-array",
        addLabel: "Add feature",
        emptyMessage: "No features yet — click Add feature",
        jsonArraySchema: [
          { key: "icon", label: "Icon (emoji)", type: "icon", placeholder: "⚡" },
          { key: "title", label: "Title", type: "text", placeholder: "Fast", required: true },
          { key: "description", label: "Description", type: "text", placeholder: "Built for speed" },
        ],
      }),
    columns: z
      .number()
      .int()
      .min(1)
      .max(4)
      .default(3)
      .describe("Number of columns (1–4)"),
    variant: z.enum(VARIANTS).default("default"),
    ...BACKGROUND_SCHEMA_SHAPE,
  }
);

registerBlock({
  type: "featureList",
  label: "Feature List",
  description: "Grid of features/benefits with icon, heading, and description",
  iconName: "LayoutGrid",
  family: "content",
  group: "publishing",
  contentModel: null,
  atom: true,
  attrsSchema: featureSchema,
  defaultAttrs: featureDefaults(),
  slashCommand: "/features",
  searchTerms: ["feature", "benefits", "grid", "list", "icons", "services"],
});

// ─── Shared attrs ─────────────────────────────────────────────────────────────

function featureAttrs() {
  return {
    blockId: { default: null },
    blockType: { default: "featureList" },
    items: {
      default: "[]",
      parseHTML: (el: Element) => el.getAttribute("data-items") ?? "[]",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-items": attrs.items }),
    },
    columns: {
      default: 3,
      parseHTML: (el: Element) => parseInt(el.getAttribute("data-columns") ?? "3", 10),
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-columns": attrs.columns }),
    },
    variant: {
      default: "default",
      parseHTML: (el: Element) => el.getAttribute("data-variant") ?? "default",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-variant": attrs.variant }),
    },
    ...backgroundAttrs(),
  };
}

function editorHtml(items: FeatureItem[], columns: number, variant: string): string {
  if (items.length === 0) {
    return `
      <div style="padding:20px;border:1px dashed #d1d5db;border-radius:8px;text-align:center">
        <p style="margin:0 0 4px;font-size:13px;font-weight:500;color:#374151">Feature List</p>
        <p style="margin:0;font-size:12px;color:#9ca3af">Add features via Properties (⋯)</p>
        <p style="margin:6px 0 0;font-size:11px;color:#d1d5db;font-family:monospace">{"icon":"⚡","title":"Fast","description":"..."}</p>
      </div>
    `;
  }

  const gap = Math.max(100 / columns - 2, 10);
  const cards = items
    .map(
      (item) => `
      <div style="flex:0 1 ${gap}%;min-width:120px;padding:12px;background:#f9fafb;border-radius:6px;border:1px solid #f3f4f6">
        ${item.icon ? `<p style="margin:0 0 6px;font-size:20px">${item.icon}</p>` : ""}
        <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#111827">${item.title}</p>
        ${item.description ? `<p style="margin:0;font-size:12px;color:#6b7280">${item.description}</p>` : ""}
      </div>
    `
    )
    .join("");

  return `
    <div style="display:flex;flex-wrap:wrap;gap:8px">${cards}</div>
    <p style="margin:6px 0 0;font-size:11px;color:#9ca3af">${items.length} feature${items.length === 1 ? "" : "s"} · ${columns} col · ${variant}</p>
  `;
}

// ─── Client extension ─────────────────────────────────────────────────────────

export const FeatureList = Node.create({
  name: "featureList",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes: featureAttrs,

  parseHTML() {
    return [{ tag: 'div[data-block-type="featureList"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "block-feature-list",
        "data-block-type": "featureList",
      }),
    ];
  },

  addNodeView() {
    return createBlockNodeView({
      blockType: "featureList",
      label: "Feature List",
      iconName: "LayoutGrid",
      atom: true,
      renderContent(node, contentDom) {
        contentDom.className = "block-feature-list-editor";
        const a = node.attrs as Record<string, string>;
        const bgStyle = a.bgGradient ? `background:${a.bgGradient}` : a.bgColor ? `background:${a.bgColor}` : "";
        contentDom.setAttribute("style", bgStyle);
        contentDom.innerHTML = editorHtml(
          parseItems(a.items),
          node.attrs.columns as number,
          a.variant,
        );
      },
      updateContent(node, contentDom) {
        const a = node.attrs as Record<string, string>;
        const bgStyle = a.bgGradient ? `background:${a.bgGradient}` : a.bgColor ? `background:${a.bgColor}` : "";
        contentDom.setAttribute("style", bgStyle);
        contentDom.innerHTML = editorHtml(
          parseItems(a.items),
          node.attrs.columns as number,
          a.variant,
        );
        return true;
      },
    });
  },
});

// ─── Server extension ─────────────────────────────────────────────────────────

export const ServerFeatureList = Node.create({
  name: "featureList",
  group: "block",
  atom: true,

  addAttributes: featureAttrs,

  parseHTML() {
    return [{ tag: 'div[data-block-type="featureList"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const items = parseItems(HTMLAttributes["data-items"] ?? "[]");
    const columns = parseInt(String(HTMLAttributes["data-columns"] ?? "3"), 10);
    const variant = (HTMLAttributes["data-variant"] as string) || "default";
    const bgColor = (HTMLAttributes["data-bg-color"] as string) || "";
    const bgGradient = (HTMLAttributes["data-bg-gradient"] as string) || "";
    const bgStyle = bgGradient ? `background:${bgGradient}` : bgColor ? `background:${bgColor}` : "";

    const cards = items.map((item) => [
      "li",
      { class: "block-feature-item" },
      ...(item.icon ? [["span", { class: "block-feature-icon", "aria-hidden": "true" }, item.icon]] : []),
      ["div", { class: "block-feature-content" },
        ["h3", { class: "block-feature-title" }, item.title],
        ...(item.description ? [["p", { class: "block-feature-desc" }, item.description]] : []),
      ],
    ]);

    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: `block-feature-list block-feature-list--${variant} block-feature-list--cols-${columns}`,
        "data-block-type": "featureList",
        ...(bgStyle ? { style: bgStyle } : {}),
      }),
      ...(items.length > 0
        ? [["ul", { class: "block-feature-grid" }, ...cards]]
        : [["p", { class: "block-feature-empty" }, "No features"]]),
    ];
  },
});
