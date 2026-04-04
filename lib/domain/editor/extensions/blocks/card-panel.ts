/**
 * Card/Panel Block
 *
 * Bordered container with optional header. Wraps block+ content.
 * Settings mirror the columns block: border style + background toggle.
 *
 * Sprint 44: Content Blocks (simplified Sprint 44b — collapsible removed, use accordion)
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { z } from "zod";
import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import { createBlockNodeView } from "@/lib/domain/blocks/node-view-factory";

const { schema: cardPanelSchema, defaults: cardPanelDefaults } =
  createBlockSchema("cardPanel", {
    headerText: z.string().default("").describe("Optional header text"),
    cardBorder: z
      .enum(["none", "subtle", "solid", "dashed"])
      .default("subtle")
      .describe("Card border style"),
    showBackground: z
      .boolean()
      .default(true)
      .describe("Show card background fill"),
  });

registerBlock({
  type: "cardPanel",
  label: "Card / Panel",
  description: "Bordered container with optional header",
  iconName: "SquareStack",
  family: "content",
  group: "container",
  contentModel: "block+",
  atom: false,
  attrsSchema: cardPanelSchema,
  defaultAttrs: cardPanelDefaults(),
  slashCommand: "/card",
  searchTerms: ["card", "panel", "container", "box", "wrapper"],
  hiddenFields: ["headerText"],
});

export const CardPanel = Node.create({
  name: "cardPanel",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      blockId: { default: null },
      blockType: { default: "cardPanel" },
      headerText: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-header") || "",
        renderHTML: (attrs) => {
          if (!attrs.headerText) return {};
          return { "data-header": attrs.headerText };
        },
      },
      cardBorder: {
        default: "subtle",
        parseHTML: (el) => el.getAttribute("data-card-border") || "subtle",
        renderHTML: (attrs) => ({ "data-card-border": attrs.cardBorder }),
      },
      showBackground: {
        default: true,
        parseHTML: (el) => el.getAttribute("data-card-bg") !== "hidden",
        renderHTML: (attrs) => attrs.showBackground ? {} : { "data-card-bg": "hidden" },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-block-type="cardPanel"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "block-card-panel",
        "data-block-type": "cardPanel",
      }),
      0,
    ];
  },

  addNodeView() {
    return createBlockNodeView({
      blockType: "cardPanel",
      label: "Card / Panel",
      iconName: "SquareStack",
      atom: false,
      renderContent(node, contentDom) {
        contentDom.classList.add("block-card-panel-content");
        contentDom.setAttribute("data-card-border", node.attrs.cardBorder || "subtle");
        if (!node.attrs.showBackground) {
          contentDom.setAttribute("data-card-bg", "hidden");
        }
        if (node.attrs.headerText) {
          const header = document.createElement("div");
          header.classList.add("block-card-header");
          header.contentEditable = "false";
          header.textContent = node.attrs.headerText;
          contentDom.parentElement?.insertBefore(header, contentDom);
        }
      },
      updateContent(node, contentDom) {
        contentDom.setAttribute("data-card-border", node.attrs.cardBorder || "subtle");
        if (node.attrs.showBackground === false) {
          contentDom.setAttribute("data-card-bg", "hidden");
        } else {
          contentDom.removeAttribute("data-card-bg");
        }
        // Update or create header
        const existingHeader = contentDom.parentElement?.querySelector(".block-card-header");
        if (node.attrs.headerText) {
          if (existingHeader) {
            existingHeader.textContent = node.attrs.headerText;
          } else {
            const header = document.createElement("div");
            header.classList.add("block-card-header");
            header.contentEditable = "false";
            header.textContent = node.attrs.headerText;
            contentDom.parentElement?.insertBefore(header, contentDom);
          }
        } else if (existingHeader) {
          existingHeader.remove();
        }
        return true;
      },
    });
  },
});

/** Server-safe version */
export const ServerCardPanel = Node.create({
  name: "cardPanel",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      blockId: { default: null },
      blockType: { default: "cardPanel" },
      headerText: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-header") || "",
        renderHTML: (attrs) => {
          if (!attrs.headerText) return {};
          return { "data-header": attrs.headerText };
        },
      },
      cardBorder: {
        default: "subtle",
        parseHTML: (el) => el.getAttribute("data-card-border") || "subtle",
        renderHTML: (attrs) => ({ "data-card-border": attrs.cardBorder }),
      },
      showBackground: {
        default: true,
        parseHTML: (el) => el.getAttribute("data-card-bg") !== "hidden",
        renderHTML: (attrs) => attrs.showBackground ? {} : { "data-card-bg": "hidden" },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-block-type="cardPanel"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "block-card-panel",
        "data-block-type": "cardPanel",
      }),
      0,
    ];
  },
});
