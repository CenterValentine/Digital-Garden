/**
 * Section Header Block
 *
 * Styled section divider with editable heading text.
 * Content model: inline* (editable heading text inside the node).
 *
 * Attrs:
 * - level: 1-3 (heading size)
 * - label: display text (fallback when inline content is empty)
 * - showDivider: whether to render a horizontal line below
 * - dividerStyle: "solid" | "dashed" | "dotted"
 *
 * Sprint 44: Content Blocks
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { z } from "zod";
import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import { blockIdAttr } from "@/lib/domain/blocks/data-attr";
import { createBlockNodeView } from "@/lib/domain/blocks/node-view-factory";
import { dataAttr } from "@/lib/domain/blocks/data-attr";

// Schema
const { schema: sectionHeaderSchema, defaults: sectionHeaderDefaults } =
  createBlockSchema("sectionHeader", {
    level: z.number().int().min(1).max(3).default(1).describe("Heading level (1-3)"),
    label: z.string().default("").describe("Section heading text"),
    dividerStyle: z
      .enum(["none", "solid", "dashed", "dotted"])
      .default("solid")
      .describe("Decorative line below heading (none = hidden)"),
    showContainer: z.boolean().default(false).describe("Show border"),
  });

// Register in block registry
registerBlock({
  type: "sectionHeader",
  label: "Section Header",
  description: "Styled section divider with heading text",
  iconName: "Heading",
  family: "content",
  group: "text",
  contentModel: "inline*",
  atom: false,
  attrsSchema: sectionHeaderSchema,
  defaultAttrs: sectionHeaderDefaults(),
  slashCommand: "/section",
  searchTerms: ["section", "header", "heading", "divider", "title"],
});

export const SectionHeader = Node.create({
  name: "sectionHeader",
  group: "block",
  content: "inline*",
  defining: true,

  addAttributes() {
    return {
      blockId: blockIdAttr,
      blockType: { default: "sectionHeader" },
      level: dataAttr<number>("level", { default: 1, parseAs: "number" }),
      label: dataAttr("label"),
      dividerStyle: dataAttr("dividerStyle", { default: "solid" }),
      // skipDefault keeps the historical "omit when false" emission shape
      // so existing content round-trips byte-identically (dev=prod DB).
      showContainer: dataAttr<boolean>("showContainer", { default: false, parseAs: "boolean", skipDefault: true }),
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-block-type="sectionHeader"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const dividerStyle = (node.attrs.dividerStyle as string) || "solid";
    const innerAttrs: Record<string, string> = {
      class: "block-section-header-content",
      "data-level": String(node.attrs.level ?? 1),
    };
    if (dividerStyle !== "none") {
      innerAttrs["data-show-divider"] = "true";
      innerAttrs["data-divider-style"] = dividerStyle;
    }
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "block-section-header",
        "data-block-type": "sectionHeader",
      }),
      ["div", innerAttrs, 0],
    ];
  },

  addNodeView() {
    return createBlockNodeView({
      blockType: "sectionHeader",
      label: "Section Header",
      iconName: "Heading",
      atom: false,
      containerAttr: "showContainer",
      renderContent(node, contentDom) {
        contentDom.classList.add("block-section-header-content");
        contentDom.setAttribute("data-level", String(node.attrs.level));
        const style = node.attrs.dividerStyle || "solid";
        if (style !== "none") {
          contentDom.setAttribute("data-show-divider", "true");
          contentDom.setAttribute("data-divider-style", style);
        }
      },
      updateContent(node, contentDom) {
        contentDom.setAttribute("data-level", String(node.attrs.level));
        const style = node.attrs.dividerStyle || "solid";
        if (style !== "none") {
          contentDom.setAttribute("data-show-divider", "true");
          contentDom.setAttribute("data-divider-style", style);
        } else {
          contentDom.removeAttribute("data-show-divider");
        }
        return true;
      },
    });
  },
});

/** Server-safe version (no NodeView) */
export const ServerSectionHeader = Node.create({
  name: "sectionHeader",
  group: "block",
  content: "inline*",
  defining: true,

  addAttributes() {
    return {
      blockId: blockIdAttr,
      blockType: { default: "sectionHeader" },
      level: dataAttr<number>("level", { default: 1, parseAs: "number" }),
      label: dataAttr("label"),
      dividerStyle: dataAttr("dividerStyle", { default: "solid" }),
      // skipDefault keeps the historical "omit when false" emission shape
      // so existing content round-trips byte-identically (dev=prod DB).
      showContainer: dataAttr<boolean>("showContainer", { default: false, parseAs: "boolean", skipDefault: true }),
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-block-type="sectionHeader"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const dividerStyle = (node.attrs.dividerStyle as string) || "solid";
    const innerAttrs: Record<string, string> = {
      class: "block-section-header-content",
      "data-level": String(node.attrs.level ?? 1),
    };
    if (dividerStyle !== "none") {
      innerAttrs["data-show-divider"] = "true";
      innerAttrs["data-divider-style"] = dividerStyle;
    }
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "block-section-header",
        "data-block-type": "sectionHeader",
      }),
      ["div", innerAttrs, 0],
    ];
  },
});
