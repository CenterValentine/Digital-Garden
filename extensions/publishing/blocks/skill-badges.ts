/**
 * SkillBadges Block — W10 Publishing Block
 *
 * Atom block: a grid of technology/skill pill badges.
 * Each badge has a label and optional color category.
 *
 * Attrs:
 * - items    JSON string: [{label, category?}]
 * - variant  pills | chips | tags | grid
 * - label    Optional section heading (e.g. "Technologies")
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { z } from "zod";
import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import { blockIdAttr } from "@/lib/domain/blocks/data-attr";
import { createBlockNodeView } from "@/lib/domain/blocks/node-view-factory";
import { dataAttr } from "@/lib/domain/blocks/data-attr";

export interface SkillItem {
  label: string;
  category?: string;
}

function parseItems(raw: string): SkillItem[] {
  try { return JSON.parse(raw) as SkillItem[]; } catch { return []; }
}

const VARIANTS = ["pills", "chips", "tags", "grid"] as const;

const { schema: skillSchema, defaults: skillDefaults } = createBlockSchema(
  "skillBadges",
  {
    items: z
      .string()
      .default("[]")
      .describe('JSON array: [{"label":"TypeScript"},{"label":"React","category":"frontend"}]')
      .meta({
        fieldType: "json-array",
        addLabel: "Add skill",
        emptyMessage: "No skills yet — click Add skill",
        jsonArraySchema: [
          { key: "label", label: "Skill name", type: "text", placeholder: "TypeScript", required: true },
          { key: "category", label: "Category", type: "text", placeholder: "frontend (optional — for grouping)" },
        ],
      }),
    label: z.string().default("").describe('Optional section label (e.g. "Technologies")'),
    variant: z.enum(VARIANTS).default("pills"),
  }
);

registerBlock({
  type: "skillBadges",
  label: "Skill Badges",
  description: "Grid of technology/skill pill badges",
  iconName: "Tags",
  family: "content",
  group: "publishing",
  contentModel: null,
  atom: true,
  attrsSchema: skillSchema,
  defaultAttrs: skillDefaults(),
  slashCommand: "/skills",
  searchTerms: ["skills", "tech", "stack", "badges", "technologies", "tags", "expertise"],
});

function skillAttrs() {
  return {
    blockId: blockIdAttr,
    blockType: { default: "skillBadges" },
    items: dataAttr("items", { default: "[]" }),
    label: dataAttr("label"),
    variant: dataAttr("variant", { default: "pills" }),
  };
}

function editorHtml(items: SkillItem[], label: string, variant: string): string {
  if (items.length === 0) {
    return `
      <div style="padding:20px;border:1px dashed #d1d5db;border-radius:8px;text-align:center">
        <p style="margin:0 0 4px;font-size:13px;font-weight:500;color:#374151">Skill Badges</p>
        <p style="margin:0;font-size:12px;color:#9ca3af">Add skills via Properties (⋯)</p>
        <p style="margin:6px 0 0;font-size:11px;color:#d1d5db;font-family:monospace">{"label":"TypeScript","category":"language"}</p>
      </div>
    `;
  }
  const badges = items.map((i) =>
    `<span style="padding:3px 10px;background:#ede9fe;color:#4f46e5;border-radius:20px;font-size:12px;font-weight:500">${i.label}</span>`
  ).join("");
  return `
    ${label ? `<p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#374151">${label}</p>` : ""}
    <div style="display:flex;flex-wrap:wrap;gap:6px">${badges}</div>
    <p style="margin:4px 0 0;font-size:11px;color:#9ca3af">${items.length} skill${items.length === 1 ? "" : "s"} · ${variant}</p>
  `;
}

export const SkillBadges = Node.create({
  name: "skillBadges",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes: skillAttrs,
  parseHTML() { return [{ tag: 'div[data-block-type="skillBadges"]' }]; },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { class: "block-skill-badges", "data-block-type": "skillBadges" })];
  },
  addNodeView() {
    return createBlockNodeView({
      blockType: "skillBadges", label: "Skill Badges", iconName: "Tags", atom: true,
      renderContent(node, contentDom) {
        contentDom.className = "block-skill-badges-editor";
        contentDom.innerHTML = editorHtml(parseItems(node.attrs.items as string), node.attrs.label as string, node.attrs.variant as string);
      },
      updateContent(node, contentDom) {
        contentDom.innerHTML = editorHtml(parseItems(node.attrs.items as string), node.attrs.label as string, node.attrs.variant as string);
        return true;
      },
    });
  },
});

export const ServerSkillBadges = Node.create({
  name: "skillBadges",
  group: "block",
  atom: true,

  addAttributes: skillAttrs,
  parseHTML() { return [{ tag: 'div[data-block-type="skillBadges"]' }]; },

  renderHTML({ HTMLAttributes }) {
    const items = parseItems(HTMLAttributes["data-items"] ?? "[]");
    const label = (HTMLAttributes["data-label"] as string) || "";
    const variant = (HTMLAttributes["data-variant"] as string) || "pills";

    const badgeEls = items.map((item) => [
      "span",
      {
        class: `block-skill-badge${item.category ? ` block-skill-badge--${item.category}` : ""}`,
      },
      item.label,
    ]);

    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: `block-skill-badges block-skill-badges--${variant}`,
        "data-block-type": "skillBadges",
      }),
      ...(label ? [["p", { class: "block-skill-badges-label" }, label]] : []),
      ...(items.length > 0
        ? [["div", { class: "block-skill-badges-grid" }, ...badgeEls]]
        : []),
    ];
  },
});
