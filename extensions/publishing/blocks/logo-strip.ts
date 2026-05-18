/**
 * LogoStrip Block — W9 Publishing Block
 *
 * Atom block: a horizontal strip of company/partner/client logos.
 * Each logo is an image URL with optional link and alt text.
 *
 * Attrs:
 * - items    JSON string: [{src, alt, url?}]
 * - label    Optional heading above the strip (e.g. "Trusted by")
 * - grayscale  Render logos in greyscale, full color on hover
 * - variant  default | tight | spacious | bordered
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { z } from "zod";
import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import { createBlockNodeView } from "@/lib/domain/blocks/node-view-factory";

export interface LogoItem {
  src: string;
  alt?: string;
  url?: string;
}

function parseItems(raw: string): LogoItem[] {
  try { return JSON.parse(raw) as LogoItem[]; } catch { return []; }
}

const VARIANTS = ["default", "tight", "spacious", "bordered"] as const;

const { schema: logoSchema, defaults: logoDefaults } = createBlockSchema(
  "logoStrip",
  {
    items: z
      .string()
      .default("[]")
      .describe('JSON array of logos. Each item: {"src":"https://...","alt":"Company","url":"https://..."}')
      .meta({
        fieldType: "json-array",
        addLabel: "Add logo",
        emptyMessage: "No logos yet — click Add logo",
        jsonArraySchema: [
          { key: "src", label: "Logo image", type: "image", required: true },
          { key: "alt", label: "Alt text", type: "text", placeholder: "Company name" },
          { key: "url", label: "Link URL", type: "url", placeholder: "https://company.com" },
        ],
      }),
    label: z.string().default("").describe('Optional label above the strip (e.g. "As seen in")'),
    grayscale: z.boolean().default(true).describe("Show logos in greyscale, colour on hover"),
    variant: z.enum(VARIANTS).default("default"),
  }
);

registerBlock({
  type: "logoStrip",
  label: "Logo Strip",
  description: "Horizontal row of partner/client logos",
  iconName: "Image",
  family: "content",
  group: "publishing",
  contentModel: null,
  atom: true,
  attrsSchema: logoSchema,
  defaultAttrs: logoDefaults(),
  slashCommand: "/logos",
  searchTerms: ["logo", "brand", "partner", "client", "sponsor", "strip"],
});

function logoAttrs() {
  return {
    blockId: { default: null },
    blockType: { default: "logoStrip" },
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
    grayscale: {
      default: true,
      parseHTML: (el: Element) => el.getAttribute("data-grayscale") !== "false",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-grayscale": attrs.grayscale }),
    },
    variant: {
      default: "default",
      parseHTML: (el: Element) => el.getAttribute("data-variant") ?? "default",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-variant": attrs.variant }),
    },
  };
}

function editorHtml(items: LogoItem[], label: string, variant: string): string {
  if (items.length === 0) {
    return `
      <div style="padding:20px;border:1px dashed #d1d5db;border-radius:8px;text-align:center">
        <p style="margin:0 0 4px;font-size:13px;font-weight:500;color:#374151">Logo Strip</p>
        <p style="margin:0;font-size:12px;color:#9ca3af">Add logo URLs via Properties (⋯)</p>
      </div>
    `;
  }
  const logos = items
    .map((i) => `<img src="${i.src}" alt="${i.alt ?? ""}" style="height:32px;object-fit:contain;filter:grayscale(1);opacity:.6" />`)
    .join("");
  return `
    ${label ? `<p style="margin:0 0 8px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#9ca3af;text-align:center">${label}</p>` : ""}
    <div style="display:flex;align-items:center;gap:24px;flex-wrap:wrap;justify-content:center">${logos}</div>
    <p style="margin:4px 0 0;font-size:11px;color:#9ca3af">${items.length} logo${items.length === 1 ? "" : "s"} · ${variant}</p>
  `;
}

export const LogoStrip = Node.create({
  name: "logoStrip",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes: logoAttrs,
  parseHTML() { return [{ tag: 'div[data-block-type="logoStrip"]' }]; },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { class: "block-logo-strip", "data-block-type": "logoStrip" })];
  },
  addNodeView() {
    return createBlockNodeView({
      blockType: "logoStrip", label: "Logo Strip", iconName: "Image", atom: true,
      renderContent(node, contentDom) {
        contentDom.className = "block-logo-strip-editor";
        contentDom.innerHTML = editorHtml(parseItems(node.attrs.items as string), node.attrs.label as string, node.attrs.variant as string);
      },
      updateContent(node, contentDom) {
        contentDom.innerHTML = editorHtml(parseItems(node.attrs.items as string), node.attrs.label as string, node.attrs.variant as string);
        return true;
      },
    });
  },
});

export const ServerLogoStrip = Node.create({
  name: "logoStrip",
  group: "block",
  atom: true,

  addAttributes: logoAttrs,
  parseHTML() { return [{ tag: 'div[data-block-type="logoStrip"]' }]; },

  renderHTML({ HTMLAttributes }) {
    const items = parseItems(HTMLAttributes["data-items"] ?? "[]");
    const label = (HTMLAttributes["data-label"] as string) || "";
    const grayscale = HTMLAttributes["data-grayscale"] !== false && HTMLAttributes["data-grayscale"] !== "false";
    const variant = (HTMLAttributes["data-variant"] as string) || "default";

    const logoEls = items.map((item) => {
      const img = ["img", { src: item.src, alt: item.alt ?? "", class: "block-logo-strip-img", loading: "lazy" }];
      return item.url
        ? ["a", { href: item.url, class: "block-logo-strip-link", rel: "noopener noreferrer" }, img]
        : ["span", { class: "block-logo-strip-link" }, img];
    });

    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: `block-logo-strip block-logo-strip--${variant}${grayscale ? " block-logo-strip--grayscale" : ""}`,
        "data-block-type": "logoStrip",
      }),
      ...(label ? [["p", { class: "block-logo-strip-label" }, label]] : []),
      ["div", { class: "block-logo-strip-row" }, ...logoEls],
    ];
  },
});
