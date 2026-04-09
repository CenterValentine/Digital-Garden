/**
 * Block Column Layout
 *
 * Multi-column layout specifically designed for block content.
 * Each column shows a "+" insert button only when empty (first block intro).
 * Subsequent blocks are added via the per-block chrome (+above/+below).
 *
 * Distinct from the text-focused `columns` block — block columns are
 * intended as containers for other blocks rather than inline text.
 * Layout blocks (columns, blockColumns, tabs) are excluded from the column insert menu.
 *
 * Sprint 47: Block Column
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { z } from "zod";
import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import { openBlockInsertMenu, syncAttrsToPanel } from "@/lib/domain/blocks/node-view-factory";
import { useBlockStore } from "@/state/block-store";
import { useRightPanelCollapseStore } from "@/state/right-panel-collapse-store";

const { schema: blockColumnsSchema, defaults: blockColumnsDefaults } =
  createBlockSchema("blockColumns", {
    columnCount: z.number().int().min(2).max(4).default(2).describe("Number of columns"),
    gapSize: z
      .enum(["none", "small", "medium", "large"])
      .default("medium")
      .describe("Gap between columns"),
    columnBorder: z
      .enum(["none", "subtle", "solid", "dashed"])
      .default("subtle")
      .describe("Column border style"),
    showContainer: z
      .boolean()
      .default(false)
      .describe("Show border"),
  });

registerBlock({
  type: "blockColumns",
  label: "Block Column",
  description: "Multi-column layout for inserting blocks (2-4 columns)",
  iconName: "LayoutGrid",
  family: "layout",
  group: "container",
  contentModel: "blockColumn+",
  atom: false,
  attrsSchema: blockColumnsSchema,
  defaultAttrs: blockColumnsDefaults(),
  slashCommand: "/block-columns",
  searchTerms: ["block column", "layout", "grid", "split", "blocks", "container"],
});

/** Returns true if the node is an empty blockColumn (single empty paragraph) */
function isColumnEmpty(node: { childCount: number; firstChild: { type: { name: string }; content: { size: number } } | null }): boolean {
  return (
    node.childCount === 1 &&
    node.firstChild?.type.name === "paragraph" &&
    node.firstChild?.content.size === 0
  );
}

/**
 * BlockColumn child node — individual column in a block column layout.
 * Custom NodeView adds a "+" insert button that is only visible when the column is empty.
 * Not independently insertable — always a child of blockColumns.
 */
export const BlockColumn = Node.create({
  name: "blockColumn",
  content: "block+",
  defining: true,
  isolating: true,

  parseHTML() {
    return [{ tag: "div.block-column-cell" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { class: "block-column-cell" }),
      0,
    ];
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement("div");
      dom.classList.add("block-column-cell");

      // Track empty state via data attribute (CSS shows/hides the + button)
      const updateEmptyState = (n: typeof node) => {
        dom.setAttribute("data-empty", isColumnEmpty(n) ? "true" : "false");
      };
      updateEmptyState(node);

      // ProseMirror renders block children into this element
      const contentDOM = document.createElement("div");
      contentDOM.classList.add("block-column-cell-content");
      dom.appendChild(contentDOM);

      // "+" button — only visible via CSS when data-empty="true"
      const insertBtn = document.createElement("button");
      insertBtn.classList.add("block-column-insert-btn");
      insertBtn.textContent = "+";
      insertBtn.title = "Add block";
      insertBtn.contentEditable = "false";
      insertBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof getPos === "function") {
          const pos = getPos();
          if (pos !== undefined) {
            // Insert at the start of the column content (pos + 1 = before first child)
            openBlockInsertMenu(editor, pos + 1, insertBtn, ["layout"]);
          }
        }
      });
      dom.appendChild(insertBtn);

      return {
        dom,
        contentDOM,
        update(updatedNode) {
          if (updatedNode.type.name !== "blockColumn") return false;
          updateEmptyState(updatedNode);
          return true;
        },
        stopEvent(event) {
          const target = event.target as HTMLElement;
          return target === insertBtn || insertBtn.contains(target);
        },
      };
    };
  },
});

/**
 * BlockColumns parent node.
 * Renders a CSS Grid with shared block chrome (badge, menu, delete, insert above/below).
 * When columnCount attr changes, syncs the actual blockColumn child count.
 */
export const BlockColumns = Node.create({
  name: "blockColumns",
  group: "block",
  content: "blockColumn+",
  defining: true,

  addAttributes() {
    return {
      blockId: { default: null },
      blockType: { default: "blockColumns" },
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
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-block-type="blockColumns"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "block-block-columns",
        "data-block-type": "blockColumns",
      }),
      0,
    ];
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
      dom.classList.add("block-node", "block-block-columns");
      dom.setAttribute("data-block-type", "blockColumns");
      dom.setAttribute("data-block-id", currentNode.attrs.blockId || "");
      dom.setAttribute("data-columns", String(currentNode.attrs.columnCount));
      dom.setAttribute("data-gap", currentNode.attrs.gapSize);
      dom.setAttribute("data-col-border", currentNode.attrs.columnBorder || "subtle");
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

      // Block chrome
      const chrome = document.createElement("div");
      chrome.classList.add("block-chrome");
      chrome.contentEditable = "false";

      const badge = document.createElement("span");
      badge.classList.add("block-type-badge");
      badge.textContent = "Block Column";
      chrome.appendChild(badge);

      const menuBtn = document.createElement("button");
      menuBtn.classList.add("block-menu-btn");
      menuBtn.textContent = "⋯";
      menuBtn.title = "Block Column properties";
      menuBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const blockId = currentNode.attrs.blockId || "";
        useBlockStore.getState().setSelectedBlock(blockId, "blockColumns");
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

      // CSS Grid content area — ProseMirror renders blockColumn children here
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
            openBlockInsertMenu(editor, pos + currentNode.nodeSize, insertBelow);
          }
        }
      });
      dom.appendChild(insertBelow);

      chrome.addEventListener("click", () => {
        const blockId = currentNode.attrs.blockId || "";
        useBlockStore.getState().setSelectedBlock(blockId, "blockColumns");
      });

      /** Sync blockColumn child count to match the columnCount attr */
      function syncColumnCount(targetCount: number, atPos: number) {
        const freshNode = editor.state.doc.nodeAt(atPos);
        if (!freshNode || freshNode.type.name !== "blockColumns") return;
        const actualCount = freshNode.childCount;
        if (actualCount === targetCount) return;

        const { tr } = editor.state;

        if (targetCount > actualCount) {
          // Append new empty blockColumn nodes at the end
          let insertOffset = 1;
          for (let i = 0; i < actualCount; i++) {
            insertOffset += freshNode.child(i).nodeSize;
          }
          for (let i = actualCount; i < targetCount; i++) {
            const newCol = editor.state.schema.nodes.blockColumn.create(
              null,
              [editor.state.schema.nodes.paragraph.create()]
            );
            tr.insert(atPos + insertOffset, newCol);
            insertOffset += newCol.nodeSize;
          }
        } else {
          // Remove trailing columns (work backwards to preserve positions)
          for (let i = actualCount - 1; i >= targetCount; i--) {
            let offset = 1;
            for (let j = 0; j < i; j++) offset += freshNode.child(j).nodeSize;
            tr.delete(atPos + offset, atPos + offset + freshNode.child(i).nodeSize);
          }
        }

        if (tr.steps.length > 0) {
          editor.view.dispatch(tr);
        }
      }

      return {
        dom,
        contentDOM,
        update(updatedNode) {
          if (updatedNode.type.name !== "blockColumns") return false;

          dom.setAttribute("data-block-id", updatedNode.attrs.blockId || "");
          dom.setAttribute("data-columns", String(updatedNode.attrs.columnCount));
          dom.setAttribute("data-gap", updatedNode.attrs.gapSize);
          dom.setAttribute("data-col-border", updatedNode.attrs.columnBorder || "subtle");
          dom.classList.toggle("block-container-hidden", updatedNode.attrs.showContainer === false);

          // Sync column count when attr changes
          if (
            updatedNode.attrs.columnCount !== currentNode.attrs.columnCount &&
            typeof getPos === "function"
          ) {
            const pos = getPos();
            if (pos !== undefined) {
              requestAnimationFrame(() => syncColumnCount(updatedNode.attrs.columnCount, pos));
            }
          }

          currentNode = updatedNode;
          return true;
        },
        selectNode() {
          dom.classList.add("block-selected", "ProseMirror-selectednode");
          const blockId = currentNode.attrs.blockId || "";
          useBlockStore.getState().setSelectedBlock(blockId, "blockColumns");
        },
        deselectNode() {
          dom.classList.remove("block-selected", "ProseMirror-selectednode");
        },
      };
    };
  },
});

/** Server-safe versions (no NodeViews) */
export const ServerBlockColumn = Node.create({
  name: "blockColumn",
  content: "block+",
  defining: true,
  isolating: true,

  parseHTML() {
    return [{ tag: "div.block-column-cell" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { class: "block-column-cell" }),
      0,
    ];
  },
});

export const ServerBlockColumns = Node.create({
  name: "blockColumns",
  group: "block",
  content: "blockColumn+",
  defining: true,

  addAttributes() {
    return {
      blockId: { default: null },
      blockType: { default: "blockColumns" },
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
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-block-type="blockColumns"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "block-block-columns",
        "data-block-type": "blockColumns",
      }),
      0,
    ];
  },
});
