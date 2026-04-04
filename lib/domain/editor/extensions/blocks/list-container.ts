/**
 * List Container Block
 *
 * Wraps OL/UL lists with block-level layout properties:
 * - listType: "bullet" | "ordered"
 * - layout: "vertical" | "horizontal"
 * - columnCount: multi-column list rendering
 * - markerStyle: visual marker customization
 *
 * Nestable inside columns, tabs, accordion.
 *
 * Sprint 44b: Block Parts
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { z } from "zod";
import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import { createBlockNodeView } from "@/lib/domain/blocks/node-view-factory";

const { schema: listSchema, defaults: listDefaults } = createBlockSchema(
  "listContainer",
  {
    listType: z
      .enum(["bullet", "ordered"])
      .default("bullet")
      .describe("List type"),
    layout: z
      .enum(["vertical", "horizontal"])
      .default("vertical")
      .describe("List item flow direction"),
    columnCount: z
      .number()
      .int()
      .min(1)
      .max(4)
      .default(1)
      .describe("Number of columns (vertical layout only)"),
    markerStyle: z
      .enum(["disc", "circle", "square", "decimal", "alpha", "roman", "none"])
      .default("disc")
      .describe("List marker style"),
  }
);

registerBlock({
  type: "listContainer",
  label: "List",
  description: "Styled list with layout options",
  iconName: "List",
  family: "content",
  group: "text",
  contentModel: "block+",
  atom: false,
  attrsSchema: listSchema,
  defaultAttrs: listDefaults(),
  slashCommand: "/list",
  searchTerms: ["list", "bullet", "ordered", "ol", "ul", "items"],
});

/**
 * List Container node.
 * Uses createBlockNodeView for shared chrome.
 * Content is a bulletList or orderedList (from TipTap StarterKit).
 */
export const ListContainer = Node.create({
  name: "listContainer",
  group: "block",
  content: "bulletList|orderedList",
  defining: true,

  addAttributes() {
    return {
      blockId: { default: null },
      blockType: { default: "listContainer" },
      listType: {
        default: "bullet",
        parseHTML: (el) => el.getAttribute("data-list-type") || "bullet",
        renderHTML: (attrs) => ({ "data-list-type": attrs.listType }),
      },
      layout: {
        default: "vertical",
        parseHTML: (el) => el.getAttribute("data-layout") || "vertical",
        renderHTML: (attrs) => ({ "data-layout": attrs.layout }),
      },
      columnCount: {
        default: 1,
        parseHTML: (el) =>
          parseInt(el.getAttribute("data-columns") || "1"),
        renderHTML: (attrs) => ({ "data-columns": attrs.columnCount }),
      },
      markerStyle: {
        default: "disc",
        parseHTML: (el) => el.getAttribute("data-marker") || "disc",
        renderHTML: (attrs) => ({ "data-marker": attrs.markerStyle }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-block-type="listContainer"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "block-list-container",
        "data-block-type": "listContainer",
      }),
      0,
    ];
  },

  addCommands() {
    return {
      insertListContainer:
        (listType: "bullet" | "ordered" = "bullet") =>
        ({ commands }: { commands: any }) => {
          const listNodeType =
            listType === "ordered" ? "orderedList" : "bulletList";
          return commands.insertContent({
            type: "listContainer",
            attrs: { listType },
            content: [
              {
                type: listNodeType,
                content: [
                  {
                    type: "listItem",
                    content: [{ type: "paragraph" }],
                  },
                ],
              },
            ],
          });
        },
    } as any;
  },

  addNodeView() {
    return createBlockNodeView({
      blockType: "listContainer",
      label: "List",
      iconName: "List",
      atom: false,
      renderContent(node, contentDom) {
        // Apply layout data attributes to the content container
        contentDom.classList.add("block-list-content");
        contentDom.setAttribute("data-layout", node.attrs.layout);
        contentDom.setAttribute(
          "data-columns",
          String(node.attrs.columnCount)
        );
        contentDom.setAttribute("data-marker", node.attrs.markerStyle);
      },
      updateContent(node, contentDom) {
        contentDom.setAttribute("data-layout", node.attrs.layout);
        contentDom.setAttribute(
          "data-columns",
          String(node.attrs.columnCount)
        );
        contentDom.setAttribute("data-marker", node.attrs.markerStyle);
        return true;
      },
    });
  },
});

/** Server-safe version */
export const ServerListContainer = Node.create({
  name: "listContainer",
  group: "block",
  content: "bulletList|orderedList",
  defining: true,

  addAttributes() {
    return {
      blockId: { default: null },
      blockType: { default: "listContainer" },
      listType: {
        default: "bullet",
        parseHTML: (el) => el.getAttribute("data-list-type") || "bullet",
        renderHTML: (attrs) => ({ "data-list-type": attrs.listType }),
      },
      layout: {
        default: "vertical",
        parseHTML: (el) => el.getAttribute("data-layout") || "vertical",
        renderHTML: (attrs) => ({ "data-layout": attrs.layout }),
      },
      columnCount: {
        default: 1,
        parseHTML: (el) =>
          parseInt(el.getAttribute("data-columns") || "1"),
        renderHTML: (attrs) => ({ "data-columns": attrs.columnCount }),
      },
      markerStyle: {
        default: "disc",
        parseHTML: (el) => el.getAttribute("data-marker") || "disc",
        renderHTML: (attrs) => ({ "data-marker": attrs.markerStyle }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-block-type="listContainer"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "block-list-container",
        "data-block-type": "listContainer",
      }),
      0,
    ];
  },
});
