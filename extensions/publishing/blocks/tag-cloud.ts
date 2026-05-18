/**
 * TagCloud Block — W10 Publishing Block
 *
 * Atom block: a browsable set of topic tags with optional links and
 * relative sizing based on a count/weight value.
 *
 * Attrs:
 * - items   JSON string: [{label, url?, weight?}]  weight 1–5 controls font size
 * - label   Optional heading above the cloud
 * - variant cloud | list | grid | pills
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { z } from "zod";
import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import { createBlockNodeView } from "@/lib/domain/blocks/node-view-factory";

export interface TagItem {
  label: string;
  url?: string;
  weight?: number;
}

function parseItems(raw: string): TagItem[] {
  try { return JSON.parse(raw) as TagItem[]; } catch { return []; }
}

const VARIANTS = ["cloud", "list", "grid", "pills"] as const;

const { schema: tagSchema, defaults: tagDefaults } = createBlockSchema(
  "tagCloud",
  {
    items: z
      .string()
      .default("[]")
      .describe('JSON array: [{"label":"React","url":"/topics/react","weight":5},{"label":"CSS","weight":2}]')
      .meta({
        fieldType: "json-array",
        addLabel: "Add tag",
        emptyMessage: "No tags yet — click Add tag",
        jsonArraySchema: [
          { key: "label", label: "Tag name", type: "text", placeholder: "React", required: true },
          { key: "url", label: "Link URL", type: "url", placeholder: "/topics/react (optional)" },
          { key: "weight", label: "Size (1–5)", type: "number", min: 1, max: 5, default: 3, placeholder: "3" },
        ],
      }),
    label: z.string().default("").describe('Optional heading (e.g. "Topics")'),
    variant: z.enum(VARIANTS).default("cloud"),
  }
);

registerBlock({
  type: "tagCloud",
  label: "Tag Cloud",
  description: "Browsable topic cloud with optional links and weight-based sizing",
  iconName: "Hash",
  family: "content",
  group: "publishing",
  contentModel: null,
  atom: true,
  attrsSchema: tagSchema,
  defaultAttrs: tagDefaults(),
  slashCommand: "/tagcloud",
  searchTerms: ["tag", "cloud", "topics", "categories", "browse", "taxonomy"],
});

function tagAttrs() {
  return {
    blockId: { default: null },
    blockType: { default: "tagCloud" },
    items: {
      default: "[]",
      parseHTML: (el: Element) => el.getAttribute("data-items") ?? "[]",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-items": attrs.items }),
    },
    label: {
      default: "",
      parseHTML: (el: Element) => el.getAttribute("data-label") ?? "",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-label": attrs.label }),
    },
    variant: {
      default: "cloud",
      parseHTML: (el: Element) => el.getAttribute("data-variant") ?? "cloud",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-variant": attrs.variant }),
    },
  };
}

const WEIGHT_SIZES = ["0.75rem", "0.875rem", "1rem", "1.125rem", "1.35rem"];

function editorHtml(items: TagItem[], label: string, variant: string): string {
  if (items.length === 0) {
    return `
      <div style="padding:20px;border:1px dashed #d1d5db;border-radius:8px;text-align:center">
        <p style="margin:0 0 4px;font-size:13px;font-weight:500;color:#374151">Tag Cloud</p>
        <p style="margin:0;font-size:12px;color:#9ca3af">Add tags via Properties (⋯)</p>
      </div>
    `;
  }
  const tags = items.map((t) => {
    const sz = WEIGHT_SIZES[Math.min((t.weight ?? 1) - 1, 4)] ?? "1rem";
    return `<span style="font-size:${sz};padding:3px 10px;background:#f3f4f6;border-radius:20px;color:#374151">${t.label}</span>`;
  }).join("");
  return `
    ${label ? `<p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#374151">${label}</p>` : ""}
    <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">${tags}</div>
    <p style="margin:4px 0 0;font-size:11px;color:#9ca3af">${items.length} tag${items.length === 1 ? "" : "s"} · ${variant}</p>
  `;
}

export const TagCloud = Node.create({
  name: "tagCloud",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes: tagAttrs,
  parseHTML() { return [{ tag: 'div[data-block-type="tagCloud"]' }]; },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { class: "block-tag-cloud", "data-block-type": "tagCloud" })];
  },
  addNodeView() {
    return createBlockNodeView({
      blockType: "tagCloud", label: "Tag Cloud", iconName: "Hash", atom: true,
      renderContent(node, contentDom) {
        contentDom.className = "block-tag-cloud-editor";
        contentDom.innerHTML = editorHtml(parseItems(node.attrs.items as string), node.attrs.label as string, node.attrs.variant as string);
      },
      updateContent(node, contentDom) {
        contentDom.innerHTML = editorHtml(parseItems(node.attrs.items as string), node.attrs.label as string, node.attrs.variant as string);
        return true;
      },
    });
  },
});

export const ServerTagCloud = Node.create({
  name: "tagCloud",
  group: "block",
  atom: true,

  addAttributes: tagAttrs,
  parseHTML() { return [{ tag: 'div[data-block-type="tagCloud"]' }]; },

  renderHTML({ HTMLAttributes }) {
    const items = parseItems(HTMLAttributes["data-items"] ?? "[]");
    const label = (HTMLAttributes["data-label"] as string) || "";
    const variant = (HTMLAttributes["data-variant"] as string) || "cloud";

    const tagEls = items.map((item) => {
      const w = Math.min(Math.max(item.weight ?? 1, 1), 5);
      const tag = ["span", { class: `block-tag-cloud-item block-tag-cloud-item--w${w}` }, item.label];
      return item.url
        ? ["a", { href: item.url, class: "block-tag-cloud-link" }, tag]
        : tag;
    });

    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: `block-tag-cloud block-tag-cloud--${variant}`,
        "data-block-type": "tagCloud",
      }),
      ...(label ? [["p", { class: "block-tag-cloud-label" }, label]] : []),
      ...(items.length > 0
        ? [["div", { class: "block-tag-cloud-items" }, ...tagEls]]
        : []),
    ];
  },
});
