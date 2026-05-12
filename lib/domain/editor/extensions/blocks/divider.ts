/**
 * Divider Block
 *
 * Styled horizontal rule with configurable style, spacing, optional label,
 * and visual variant (glyph decoration).
 * Atom node — no editable content.
 *
 * Sprint 44: Content Blocks
 * Sprint W6: Added variant attr + fixed ServerBlockDivider to emit real HTML
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { z } from "zod";
import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import { createBlockNodeView } from "@/lib/domain/blocks/node-view-factory";

const VARIANTS = ["none", "dots", "stars", "wave", "ornament"] as const;

const { schema: dividerSchema, defaults: dividerDefaults } =
  createBlockSchema("blockDivider", {
    style: z
      .enum(["solid", "dashed", "dotted", "gradient"])
      .default("solid")
      .describe("Line style"),
    spacing: z
      .enum(["compact", "normal", "spacious"])
      .default("normal")
      .describe("Vertical spacing"),
    label: z.string().default("").describe("Optional center label text (overrides variant glyph)"),
    variant: z
      .enum(VARIANTS)
      .default("none")
      .describe("Decorative glyph shown at centre (overridden by label text)"),
    showContainer: z.boolean().default(false).describe("Show border"),
  });

registerBlock({
  type: "blockDivider",
  label: "Styled Divider",
  description: "Horizontal divider with customizable style",
  iconName: "Minus",
  family: "content",
  group: "divider",
  contentModel: null,
  atom: true,
  attrsSchema: dividerSchema,
  defaultAttrs: dividerDefaults(),
  slashCommand: "/divider",
  searchTerms: ["divider", "separator", "line", "hr", "rule", "break"],
});

// ─── Glyph helper (shared between client and server) ──────────────────────────

function variantGlyph(variant: string): string {
  switch (variant) {
    case "dots":    return "· · ·";
    case "stars":   return "✦ ✦ ✦";
    case "wave":    return "〰〰〰";
    case "ornament": return "❦";
    default:        return "";
  }
}

// ─── Shared attrs ─────────────────────────────────────────────────────────────

function dividerAttrs() {
  return {
    blockId: { default: null },
    blockType: { default: "blockDivider" },
    style: {
      default: "solid",
      parseHTML: (el: Element) => el.getAttribute("data-style") || "solid",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-style": attrs.style }),
    },
    spacing: {
      default: "normal",
      parseHTML: (el: Element) => el.getAttribute("data-spacing") || "normal",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-spacing": attrs.spacing }),
    },
    label: {
      default: "",
      parseHTML: (el: Element) => el.getAttribute("data-label") || "",
      renderHTML: (attrs: Record<string, unknown>) => attrs.label ? { "data-label": attrs.label } : {},
    },
    variant: {
      default: "none",
      parseHTML: (el: Element) => el.getAttribute("data-variant") || "none",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-variant": attrs.variant }),
    },
    showContainer: {
      default: false,
      parseHTML: (el: Element) => el.getAttribute("data-show-container") === "true",
      renderHTML: (attrs: Record<string, unknown>) => attrs.showContainer ? { "data-show-container": "true" } : {},
    },
  };
}

// ─── Client extension ─────────────────────────────────────────────────────────

export const BlockDivider = Node.create({
  name: "blockDivider",
  group: "block",
  atom: true,

  addAttributes: dividerAttrs,

  parseHTML() {
    return [{ tag: 'div[data-block-type="blockDivider"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "block-divider",
        "data-block-type": "blockDivider",
      }),
    ];
  },

  addNodeView() {
    return createBlockNodeView({
      blockType: "blockDivider",
      label: "Divider",
      iconName: "Minus",
      atom: true,
      containerAttr: "showContainer",
      renderContent(node, contentDom) {
        contentDom.classList.add("block-divider-content");
        const glyph = (node.attrs.label as string) || variantGlyph(node.attrs.variant as string);
        buildDividerDom(contentDom, node.attrs.style as string, glyph);
        contentDom.setAttribute("data-spacing", node.attrs.spacing as string);
      },
      updateContent(node, contentDom) {
        contentDom.innerHTML = "";
        const glyph = (node.attrs.label as string) || variantGlyph(node.attrs.variant as string);
        buildDividerDom(contentDom, node.attrs.style as string, glyph);
        contentDom.setAttribute("data-spacing", node.attrs.spacing as string);
        return true;
      },
    });
  },
});

function buildDividerDom(contentDom: HTMLElement, style: string, glyph: string): void {
  if (glyph) {
    const left = document.createElement("hr");
    left.className = `block-divider-line block-divider-${style}`;
    left.setAttribute("role", "presentation");
    const glyphEl = document.createElement("span");
    glyphEl.className = "block-divider-label";
    glyphEl.textContent = glyph;
    const right = document.createElement("hr");
    right.className = `block-divider-line block-divider-${style}`;
    right.setAttribute("role", "presentation");
    contentDom.appendChild(left);
    contentDom.appendChild(glyphEl);
    contentDom.appendChild(right);
  } else {
    const line = document.createElement("hr");
    line.className = `block-divider-line block-divider-${style}`;
    contentDom.appendChild(line);
  }
}

// ─── Server extension ─────────────────────────────────────────────────────────

export const ServerBlockDivider = Node.create({
  name: "blockDivider",
  group: "block",
  atom: true,

  addAttributes: dividerAttrs,

  parseHTML() {
    return [{ tag: 'div[data-block-type="blockDivider"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const style = (HTMLAttributes["data-style"] as string) || "solid";
    const variant = (HTMLAttributes["data-variant"] as string) || "none";
    const label = (HTMLAttributes["data-label"] as string) || "";

    const glyph = label || variantGlyph(variant);

    const children: unknown[] = glyph
      ? [
          ["span", { class: `block-divider-line block-divider-${style} block-divider-line--left`, role: "presentation" }],
          ["span", { class: "block-divider-label" }, glyph],
          ["span", { class: `block-divider-line block-divider-${style} block-divider-line--right`, role: "presentation" }],
        ]
      : [
          ["span", { class: `block-divider-line block-divider-${style}`, role: "presentation" }],
        ];

    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "block-divider",
        "data-block-type": "blockDivider",
      }),
      ...children,
    ];
  },
});
