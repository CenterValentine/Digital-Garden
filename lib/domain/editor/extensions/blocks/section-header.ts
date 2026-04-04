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
import { createBlockNodeView } from "@/lib/domain/blocks/node-view-factory";

// Schema
const { schema: sectionHeaderSchema, defaults: sectionHeaderDefaults } =
  createBlockSchema("sectionHeader", {
    level: z.number().int().min(1).max(3).default(1).describe("Heading level (1-3)"),
    label: z.string().default("").describe("Section heading text"),
    showDivider: z.boolean().default(true).describe("Show decorative line below heading"),
    dividerStyle: z
      .enum(["solid", "dashed", "dotted"])
      .default("solid")
      .describe("Decorative line style (only when line is enabled)"),
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
      blockId: { default: null },
      blockType: { default: "sectionHeader" },
      level: {
        default: 1,
        parseHTML: (el) => parseInt(el.getAttribute("data-level") || "1"),
        renderHTML: (attrs) => ({ "data-level": attrs.level }),
      },
      label: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-label") || "",
        renderHTML: (attrs) => {
          if (!attrs.label) return {};
          return { "data-label": attrs.label };
        },
      },
      showDivider: {
        default: true,
        parseHTML: (el) => el.getAttribute("data-show-divider") !== "false",
        renderHTML: (attrs) => ({ "data-show-divider": String(attrs.showDivider) }),
      },
      dividerStyle: {
        default: "solid",
        parseHTML: (el) => el.getAttribute("data-divider-style") || "solid",
        renderHTML: (attrs) => ({ "data-divider-style": attrs.dividerStyle }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-block-type="sectionHeader"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "block-section-header",
        "data-block-type": "sectionHeader",
      }),
      0, // Content hole for inline text
    ];
  },

  addNodeView() {
    return createBlockNodeView({
      blockType: "sectionHeader",
      label: "Section Header",
      iconName: "Heading",
      atom: false,
      renderContent(node, contentDom) {
        contentDom.classList.add("block-section-header-content");
        contentDom.setAttribute("data-level", String(node.attrs.level));
        if (node.attrs.showDivider) {
          contentDom.setAttribute("data-show-divider", "true");
          contentDom.setAttribute("data-divider-style", node.attrs.dividerStyle);
        }
      },
      updateContent(node, contentDom) {
        contentDom.setAttribute("data-level", String(node.attrs.level));
        if (node.attrs.showDivider) {
          contentDom.setAttribute("data-show-divider", "true");
          contentDom.setAttribute("data-divider-style", node.attrs.dividerStyle);
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
      blockId: { default: null },
      blockType: { default: "sectionHeader" },
      level: {
        default: 1,
        parseHTML: (el) => parseInt(el.getAttribute("data-level") || "1"),
        renderHTML: (attrs) => ({ "data-level": attrs.level }),
      },
      label: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-label") || "",
        renderHTML: (attrs) => {
          if (!attrs.label) return {};
          return { "data-label": attrs.label };
        },
      },
      showDivider: {
        default: true,
        parseHTML: (el) => el.getAttribute("data-show-divider") !== "false",
        renderHTML: (attrs) => ({ "data-show-divider": String(attrs.showDivider) }),
      },
      dividerStyle: {
        default: "solid",
        parseHTML: (el) => el.getAttribute("data-divider-style") || "solid",
        renderHTML: (attrs) => ({ "data-divider-style": attrs.dividerStyle }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-block-type="sectionHeader"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "block-section-header",
        "data-block-type": "sectionHeader",
      }),
      0,
    ];
  },
});
