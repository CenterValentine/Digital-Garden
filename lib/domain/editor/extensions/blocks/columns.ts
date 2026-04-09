/**
 * Columns Layout Block
 *
 * Multi-column layout using CSS Grid.
 * Parent node (columns) contains child nodes (column), each with block+ content.
 *
 * Sprint 44: Layout Blocks (simplified Sprint 44b — resize handles deferred)
 */

import { Node, mergeAttributes, type CommandProps, type RawCommands } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { z } from "zod";
import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import { useBlockStore } from "@/state/block-store";
import { useRightPanelCollapseStore } from "@/state/right-panel-collapse-store";
import { openBlockInsertMenu, syncAttrsToPanel } from "@/lib/domain/blocks/node-view-factory";

const { schema: columnsSchema, defaults: columnsDefaults } =
  createBlockSchema("columns", {
    columnCount: z.number().int().min(2).max(4).default(2).describe("Number of columns"),
    gapSize: z
      .enum(["none", "small", "medium", "large"])
      .default("medium")
      .describe("Gap between columns"),
    columnBorder: z
      .enum(["none", "subtle", "solid", "dashed"])
      .default("subtle")
      .describe("Inner column border style"),
    showContainer: z
      .boolean()
      .default(false)
      .describe("Show border"),
    showBackground: z
      .boolean()
      .default(true)
      .describe("Show column background fill"),
  });

registerBlock({
  type: "columns",
  label: "Columns",
  description: "Multi-column layout (2-4 columns)",
  iconName: "Columns3",
  family: "layout",
  group: "container",
  contentModel: "column+",
  atom: false,
  attrsSchema: columnsSchema,
  defaultAttrs: columnsDefaults(),
  slashCommand: "/columns",
  searchTerms: ["columns", "col", "layout", "grid", "side", "split"],
});

/**
 * Column child node — each column in a columns layout.
 * Not registered in the block registry (not independently insertable).
 */
export const Column = Node.create({
  name: "column",
  content: "block+",
  defining: true,
  isolating: true,

  parseHTML() {
    return [{ tag: "div.block-column" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { class: "block-column" }),
      0,
    ];
  },
});

/**
 * Columns parent node.
 * Uses a custom NodeView with CSS Grid layout and shared block chrome.
 */
export const Columns = Node.create({
  name: "columns",
  group: "block",
  content: "column+",
  defining: true,

  addAttributes() {
    return {
      blockId: { default: null },
      blockType: { default: "columns" },
      columnCount: {
        default: 2,
        parseHTML: (el) => parseInt(el.getAttribute("data-columns") || "2"),
        renderHTML: (attrs) => ({ "data-columns": attrs.columnCount }),
      },
      gapSize: {
        default: "medium",
        parseHTML: (el) => el.getAttribute("data-gap") || "medium",
        renderHTML: (attrs) => ({ "data-gap": attrs.gapSize }),
      },
      columnBorder: {
        default: "subtle",
        parseHTML: (el) => el.getAttribute("data-col-border") || "subtle",
        renderHTML: (attrs) => ({ "data-col-border": attrs.columnBorder }),
      },
      showContainer: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-show-container") !== "false",
        renderHTML: (attrs) => ({ "data-show-container": String(attrs.showContainer) }),
      },
      showBackground: {
        default: true,
        parseHTML: (el) => el.getAttribute("data-col-bg") !== "hidden",
        renderHTML: (attrs) => attrs.showBackground ? {} : { "data-col-bg": "hidden" },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-block-type="columns"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "block-columns",
        "data-block-type": "columns",
      }),
      0,
    ];
  },

  addCommands() {
    return {
      insertColumns:
        (count: number = 2) =>
        ({ commands }: CommandProps) => {
          const columnNodes = Array.from({ length: count }, () => ({
            type: "column",
            content: [{ type: "paragraph" }],
          }));

          return commands.insertContent({
            type: "columns",
            attrs: { columnCount: count },
            content: columnNodes,
          });
        },
    } as Partial<RawCommands>;
  },

  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        const { selection, doc } = editor.state;
        const $from = selection.$from;

        // Check if cursor is inside a column → columns structure
        for (let depth = $from.depth; depth > 0; depth--) {
          const node = $from.node(depth);
          if (node.type.name === "column") {
            const parentDepth = depth - 1;
            const parent = $from.node(parentDepth);
            if (parent.type.name === "columns") {
              // Find which column index we're in
              const columnPos = $from.before(depth);
              const columnsPos = $from.before(parentDepth);
              let childIndex = 0;
              let offset = 1;
              for (let i = 0; i < parent.childCount; i++) {
                if (columnsPos + offset === columnPos) {
                  childIndex = i;
                  break;
                }
                offset += parent.child(i).nodeSize;
              }

              // Move to next column (wrap around)
              const nextIndex = (childIndex + 1) % parent.childCount;
              let nextOffset = 1;
              for (let i = 0; i < nextIndex; i++) {
                nextOffset += parent.child(i).nodeSize;
              }
              const nextColStart = columnsPos + nextOffset + 1;
              const $pos = doc.resolve(nextColStart);
              const tr = editor.state.tr.setSelection(TextSelection.near($pos));
              editor.view.dispatch(tr);
              return true;
            }
          }
        }
        return false;
      },
    };
  },

  addNodeView() {
    return ({ node: initialNode, getPos, editor }) => {
      let currentNode = initialNode;

      // Auto-assign blockId if missing
      if (!currentNode.attrs.blockId && typeof getPos === "function") {
        const pos = getPos();
        if (pos !== undefined) {
          const newId = crypto.randomUUID();
          const { tr } = editor.state;
          tr.setNodeMarkup(pos, undefined, { ...currentNode.attrs, blockId: newId });
          editor.view.dispatch(tr);
        }
      }

      const dom = document.createElement("div");
      dom.classList.add("block-node", "block-columns");
      dom.setAttribute("data-block-type", "columns");
      dom.setAttribute("data-block-id", currentNode.attrs.blockId || "");
      dom.setAttribute("data-columns", String(currentNode.attrs.columnCount));
      dom.setAttribute("data-gap", currentNode.attrs.gapSize);
      dom.setAttribute("data-col-border", currentNode.attrs.columnBorder || "subtle");
      if (!currentNode.attrs.showBackground) {
        dom.setAttribute("data-col-bg", "hidden");
      }
      if (currentNode.attrs.showContainer === false) {
        dom.classList.add("block-container-hidden");
      }

      // "+" button ABOVE block
      const insertAbove = document.createElement("button");
      insertAbove.classList.add("block-insert-btn", "block-insert-above");
      insertAbove.contentEditable = "false";
      insertAbove.innerHTML = "+";
      insertAbove.title = "Insert block above";
      insertAbove.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof getPos === "function") {
          const pos = getPos();
          if (pos !== undefined) openBlockInsertMenu(editor, pos, insertAbove);
        }
      });
      dom.appendChild(insertAbove);

      // Block chrome (hover-only: ⋯ menu + delete)
      const chrome = document.createElement("div");
      chrome.classList.add("block-chrome");
      chrome.contentEditable = "false";

      const badge = document.createElement("span");
      badge.classList.add("block-type-badge");
      badge.textContent = "Text Columns";
      chrome.appendChild(badge);

      const menuBtn = document.createElement("button");
      menuBtn.classList.add("block-menu-btn");
      menuBtn.textContent = "⋯";
      menuBtn.title = "Column properties";
      menuBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const blockId = currentNode.attrs.blockId || "";
        useBlockStore.getState().setSelectedBlock(blockId, "columns");
        useBlockStore.getState().openProperties();
        useRightPanelCollapseStore.getState().setCollapsed(false);
        syncAttrsToPanel(blockId, currentNode.attrs);
      });
      chrome.appendChild(menuBtn);

      const deleteBtn = document.createElement("button");
      deleteBtn.classList.add("block-delete-btn");
      deleteBtn.innerHTML = "×";
      deleteBtn.title = "Delete block";
      deleteBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof getPos === "function") {
          const pos = getPos();
          if (pos !== undefined) {
            editor
              .chain()
              .focus()
              .deleteRange({ from: pos, to: pos + currentNode.nodeSize })
              .run();
          }
        }
      });
      chrome.appendChild(deleteBtn);
      dom.appendChild(chrome);

      // Content area — CSS Grid, ProseMirror manages column children here
      const contentDOM = document.createElement("div");
      contentDOM.classList.add("block-columns-grid");
      dom.appendChild(contentDOM);

      // "+" button BELOW block
      const insertBelow = document.createElement("button");
      insertBelow.classList.add("block-insert-btn", "block-insert-below");
      insertBelow.contentEditable = "false";
      insertBelow.innerHTML = "+";
      insertBelow.title = "Insert block below";
      insertBelow.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof getPos === "function") {
          const pos = getPos();
          if (pos !== undefined) {
            const after = pos + currentNode.nodeSize;
            openBlockInsertMenu(editor, after, insertBelow);
          }
        }
      });
      dom.appendChild(insertBelow);

      // Click on chrome to select for properties
      chrome.addEventListener("click", () => {
        const blockId = currentNode.attrs.blockId || "";
        useBlockStore.getState().setSelectedBlock(blockId, "columns");
      });

      return {
        dom,
        contentDOM,
        update(updatedNode) {
          if (updatedNode.type.name !== "columns") return false;
          currentNode = updatedNode;
          dom.setAttribute("data-block-id", updatedNode.attrs.blockId || "");
          dom.setAttribute("data-columns", String(updatedNode.attrs.columnCount));
          dom.setAttribute("data-gap", updatedNode.attrs.gapSize);
          dom.setAttribute("data-col-border", updatedNode.attrs.columnBorder || "subtle");
          if (updatedNode.attrs.showBackground === false) {
            dom.setAttribute("data-col-bg", "hidden");
          } else {
            dom.removeAttribute("data-col-bg");
          }
          dom.classList.toggle("block-container-hidden", updatedNode.attrs.showContainer === false);
          return true;
        },
        selectNode() {
          dom.classList.add("block-selected", "ProseMirror-selectednode");
          const blockId = currentNode.attrs.blockId || "";
          useBlockStore.getState().setSelectedBlock(blockId, "columns");
        },
        deselectNode() {
          dom.classList.remove("block-selected", "ProseMirror-selectednode");
        },
      };
    };
  },
});

/** Server-safe versions */
export const ServerColumn = Node.create({
  name: "column",
  content: "block+",
  defining: true,
  isolating: true,

  parseHTML() {
    return [{ tag: "div.block-column" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { class: "block-column" }),
      0,
    ];
  },
});

export const ServerColumns = Node.create({
  name: "columns",
  group: "block",
  content: "column+",
  defining: true,

  addAttributes() {
    return {
      blockId: { default: null },
      blockType: { default: "columns" },
      columnCount: {
        default: 2,
        parseHTML: (el) => parseInt(el.getAttribute("data-columns") || "2"),
        renderHTML: (attrs) => ({ "data-columns": attrs.columnCount }),
      },
      gapSize: {
        default: "medium",
        parseHTML: (el) => el.getAttribute("data-gap") || "medium",
        renderHTML: (attrs) => ({ "data-gap": attrs.gapSize }),
      },
      columnBorder: {
        default: "subtle",
        parseHTML: (el) => el.getAttribute("data-col-border") || "subtle",
        renderHTML: (attrs) => ({ "data-col-border": attrs.columnBorder }),
      },
      showContainer: {
        default: true,
        parseHTML: (el) => el.getAttribute("data-show-container") !== "false",
        renderHTML: (attrs) => ({ "data-show-container": String(attrs.showContainer) }),
      },
      showBackground: {
        default: true,
        parseHTML: (el) => el.getAttribute("data-col-bg") !== "hidden",
        renderHTML: (attrs) => attrs.showBackground ? {} : { "data-col-bg": "hidden" },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-block-type="columns"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "block-columns",
        "data-block-type": "columns",
      }),
      0,
    ];
  },
});
