/**
 * Divider Block
 *
 * Styled horizontal rule with configurable style, spacing, and optional label.
 * Atom node — no editable content.
 *
 * Sprint 44: Content Blocks
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { z } from "zod";
import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import { createBlockNodeView } from "@/lib/domain/blocks/node-view-factory";

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
    label: z.string().default("").describe("Optional center label text"),
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

export const BlockDivider = Node.create({
  name: "blockDivider",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      blockId: { default: null },
      blockType: { default: "blockDivider" },
      style: {
        default: "solid",
        parseHTML: (el) => el.getAttribute("data-style") || "solid",
        renderHTML: (attrs) => ({ "data-style": attrs.style }),
      },
      spacing: {
        default: "normal",
        parseHTML: (el) => el.getAttribute("data-spacing") || "normal",
        renderHTML: (attrs) => ({ "data-spacing": attrs.spacing }),
      },
      label: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-label") || "",
        renderHTML: (attrs) => {
          if (!attrs.label) return {};
          return { "data-label": attrs.label };
        },
      },
    };
  },

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
      renderContent(node, contentDom) {
        contentDom.classList.add("block-divider-content");
        const line = document.createElement("hr");
        line.className = `block-divider-line block-divider-${node.attrs.style}`;
        contentDom.appendChild(line);

        if (node.attrs.label) {
          const labelEl = document.createElement("span");
          labelEl.className = "block-divider-label";
          labelEl.textContent = node.attrs.label;
          contentDom.appendChild(labelEl);
        }

        contentDom.setAttribute("data-spacing", node.attrs.spacing);
      },
      updateContent(node, contentDom) {
        contentDom.innerHTML = "";
        const line = document.createElement("hr");
        line.className = `block-divider-line block-divider-${node.attrs.style}`;
        contentDom.appendChild(line);

        if (node.attrs.label) {
          const labelEl = document.createElement("span");
          labelEl.className = "block-divider-label";
          labelEl.textContent = node.attrs.label;
          contentDom.appendChild(labelEl);
        }

        contentDom.setAttribute("data-spacing", node.attrs.spacing);
        return true;
      },
    });
  },
});

/** Server-safe version */
export const ServerBlockDivider = Node.create({
  name: "blockDivider",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      blockId: { default: null },
      blockType: { default: "blockDivider" },
      style: {
        default: "solid",
        parseHTML: (el) => el.getAttribute("data-style") || "solid",
        renderHTML: (attrs) => ({ "data-style": attrs.style }),
      },
      spacing: {
        default: "normal",
        parseHTML: (el) => el.getAttribute("data-spacing") || "normal",
        renderHTML: (attrs) => ({ "data-spacing": attrs.spacing }),
      },
      label: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-label") || "",
        renderHTML: (attrs) => {
          if (!attrs.label) return {};
          return { "data-label": attrs.label };
        },
      },
    };
  },

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
});
