/**
 * Block NodeView Factory
 *
 * Creates vanilla DOM NodeViews with shared block chrome:
 * - Drag handle (left edge)
 * - Block type badge (hover-only)
 * - "+" insertion buttons (above/below, hover-only)
 * - Selection outline
 * - "..." menu (opens Properties in right sidebar)
 *
 * Each block provides its own content renderer via options.
 * Follows the pattern in lib/domain/editor/extensions/image.ts.
 *
 * Epoch 11 Sprint 43 (updated Sprint 44b: hover chrome, inline insertion)
 */

import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import type { Editor } from "@tiptap/core";
import { useBlockStore } from "@/state/block-store";
import { useRightPanelCollapseStore } from "@/state/right-panel-collapse-store";
import { getAllSlashBlocks, getBlockDefinition } from "./registry";
import { calculateMenuPosition } from "@/lib/core/menu-positioning";

function focusEditorView(view: EditorView) {
  const element = view.dom as HTMLElement;
  if (typeof element.focus === "function") {
    element.focus({ preventScroll: true });
  }
}

/**
 * Dispatch real node attrs to PropertiesPanel after it mounts.
 * Small delay ensures the panel's block-attrs-update listener is registered.
 */
export function syncAttrsToPanel(blockId: string, attrs: Record<string, unknown>) {
  requestAnimationFrame(() => {
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("block-attrs-update", {
          detail: { blockId, attrs },
        })
      );
    }, 50);
  });
}

export interface BlockNodeViewOptions {
  /** Block type key (e.g., "sectionHeader") */
  blockType: string;
  /** Human-readable label for the badge */
  label: string;
  /** Lucide icon name for the badge */
  iconName: string;
  /** Whether this is an atom block (no editable ProseMirror content) */
  atom: boolean;
  /** Render the block-specific content area into the provided container */
  renderContent: (
    node: ProseMirrorNode,
    contentDom: HTMLElement,
    editor: Editor,
    getPos?: () => number | undefined
  ) => void;
  /** Update the content area when node attrs change. Return false to force re-render. */
  updateContent?: (
    node: ProseMirrorNode,
    contentDom: HTMLElement,
    editor: Editor,
    getPos?: () => number | undefined
  ) => boolean;
  /**
   * If provided, the named attr (boolean) controls whether block-container-hidden
   * is applied to the outer dom element. When false → hidden; when true → visible.
   */
  containerAttr?: string;
}

function isEmptyParagraph(node: ProseMirrorNode | null | undefined) {
  return Boolean(
    node &&
      node.type.name === "paragraph" &&
      node.content.size === 0 &&
      node.textContent.length === 0
  );
}

export function placeCursorAroundBlock(
  editor: Editor,
  getPos: (() => number | undefined) | undefined,
  node: ProseMirrorNode,
  side: "before" | "after"
) {
  if (!getPos) return;
  const pos = getPos();
  if (pos === undefined) return;

  const { state, view } = editor;
  const boundary = side === "before" ? pos : pos + node.nodeSize;
  const $boundary = state.doc.resolve(boundary);
  const adjacentNode = side === "before" ? $boundary.nodeBefore : $boundary.nodeAfter;
  const tr = state.tr;

  if (isEmptyParagraph(adjacentNode)) {
    const targetPos =
      side === "before"
        ? Math.max(0, boundary - 1)
        : Math.min(boundary + 1, tr.doc.content.size);
    tr.setSelection(TextSelection.near(tr.doc.resolve(targetPos), side === "before" ? -1 : 1));
    view.dispatch(tr);
    focusEditorView(view);
    return;
  }

  const paragraph = state.schema.nodes.paragraph?.create();
  if (!paragraph) return;

  tr.insert(boundary, paragraph);
  const targetPos = Math.min(boundary + 1, tr.doc.content.size);
  tr.setSelection(TextSelection.near(tr.doc.resolve(targetPos), 1));
  view.dispatch(tr);
  focusEditorView(view);
}

export function selectBlockNode(
  editor: Editor,
  getPos: (() => number | undefined) | undefined
) {
  if (!getPos) return false;
  const pos = getPos();
  if (pos === undefined) return false;

  editor.view.dispatch(
    editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos))
  );
  focusEditorView(editor.view);
  return true;
}

export function moveCursorToAdjacentParagraphAroundBlock(
  editor: Editor,
  getPos: (() => number | undefined) | undefined,
  node: ProseMirrorNode,
  side: "before" | "after"
) {
  if (!getPos) return false;
  const pos = getPos();
  if (pos === undefined) return false;

  const { state, view } = editor;
  const boundary = side === "before" ? pos : pos + node.nodeSize;
  const $boundary = state.doc.resolve(boundary);
  const adjacentNode = side === "before" ? $boundary.nodeBefore : $boundary.nodeAfter;
  if (!adjacentNode || adjacentNode.type.name !== "paragraph") {
    return false;
  }

  const targetPos =
    side === "before"
      ? Math.max(0, boundary - 1)
      : Math.min(boundary + 1, state.doc.content.size);

  view.dispatch(
    state.tr.setSelection(
      TextSelection.near(
        state.doc.resolve(targetPos),
        side === "before" ? -1 : 1
      )
    )
  );
  focusEditorView(view);
  return true;
}

/** Open the block insertion menu at a specific position */
export function openBlockInsertMenu(
  editor: Editor,
  position: number,
  triggerEl: HTMLElement,
  excludeFamilies?: string[]
) {
  const allBlocks = getAllSlashBlocks();
  const blocks = excludeFamilies
    ? allBlocks.filter((b) => !excludeFamilies.includes(b.family))
    : allBlocks;
  // Remove any existing menu
  const existing = document.querySelector(".block-insert-menu");
  if (existing) existing.remove();

  const menu = document.createElement("div");
  menu.classList.add("block-insert-menu");

  // Group by family
  const families = new Map<string, typeof blocks>();
  for (const block of blocks) {
    const list = families.get(block.family) || [];
    list.push(block);
    families.set(block.family, list);
  }

  for (const [family, defs] of families) {
    const groupLabel = document.createElement("div");
    groupLabel.classList.add("block-insert-menu-group");
    groupLabel.textContent = family.charAt(0).toUpperCase() + family.slice(1);
    menu.appendChild(groupLabel);

    for (const def of defs) {
      const item = document.createElement("button");
      item.classList.add("block-insert-menu-item");
      item.textContent = def.label;
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        menu.remove();

        // Build the insert content based on block type
        const insertJson = buildBlockInsertJson(def.type);
        editor
          .chain()
          .focus()
          .insertContentAt(position, insertJson)
          .run();
      });
      menu.appendChild(item);
    }
  }

  // Two-phase positioning: render hidden to measure, then position with boundary detection
  document.body.appendChild(menu);
  menu.style.position = "fixed";
  menu.style.zIndex = "100";
  menu.style.visibility = "hidden";

  const rect = triggerEl.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const pos = calculateMenuPosition({
    triggerPosition: { x: rect.left, y: rect.bottom + 4 },
    menuDimensions: { width: menuRect.width, height: menuRect.height },
    preferredPlacementX: "right",
    preferredPlacementY: "bottom",
  });

  menu.style.left = `${pos.x}px`;
  menu.style.top = `${pos.y}px`;
  menu.style.maxHeight = `${pos.maxHeight}px`;
  menu.style.overflowY = "auto";
  menu.style.visibility = "visible";

  // Close on click outside
  const closeHandler = (e: MouseEvent) => {
    if (!menu.contains(e.target as HTMLElement)) {
      menu.remove();
      document.removeEventListener("mousedown", closeHandler);
    }
  };
  // Defer to avoid immediate close
  requestAnimationFrame(() => {
    document.addEventListener("mousedown", closeHandler);
  });
}

/** Build TipTap JSON for inserting a new block */
export function buildBlockInsertJson(blockType: string): Record<string, unknown> {
  const id = crypto.randomUUID();
  const def = getBlockDefinition(blockType);
  const baseAttrs = {
    ...(def?.defaultAttrs ?? {}),
    blockId: id,
    blockType,
  };
  switch (blockType) {
    case "cardPanel":
      return {
        type: "cardPanel",
        attrs: { ...baseAttrs, cardBorder: "subtle", showBackground: true },
        content: [{ type: "paragraph" }],
      };
    case "accordion":
      return {
        type: "accordion",
        attrs: {
          ...baseAttrs,
          headerText: "",
          headerLevel: "2",
          openBehavior: "lastInteraction",
          openState: true,
          showContainer: false,
          showDivider: false,
        },
        content: [{ type: "paragraph" }],
      };
    case "columns":
      return {
        type: "columns",
        attrs: {
          ...baseAttrs,
          columnCount: 2,
          gapSize: "medium",
          showContainer: false,
        },
        content: [
          { type: "column", content: [{ type: "paragraph" }] },
          { type: "column", content: [{ type: "paragraph" }] },
        ],
      };
    case "tabs":
      return {
        type: "tabs",
        attrs: {
          ...baseAttrs,
          activeTab: 0,
          tabStyle: "underline",
          showContainer: false,
        },
        content: [
          { type: "tabPanel", attrs: { label: "Tab 1" }, content: [{ type: "paragraph" }] },
          { type: "tabPanel", attrs: { label: "Tab 2" }, content: [{ type: "paragraph" }] },
        ],
      };
    case "blockColumns":
      return {
        type: "blockColumns",
        attrs: {
          ...baseAttrs,
          columnCount: 2,
          showContainer: false,
        },
        content: [
          { type: "blockColumn", content: [{ type: "paragraph" }] },
          { type: "blockColumn", content: [{ type: "paragraph" }] },
        ],
      };
    case "listContainer":
      return {
        type: "listContainer",
        attrs: { ...baseAttrs, listType: "bullet" },
        content: [
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [{ type: "paragraph" }],
              },
            ],
          },
        ],
      };
    default: {
      if (def?.atom || def?.contentModel === null) {
        return { type: blockType, attrs: baseAttrs };
      }
      if (def?.contentModel === "inline*") {
        return { type: blockType, attrs: baseAttrs };
      }
      if (def?.contentModel?.includes("block")) {
        return {
          type: blockType,
          attrs: baseAttrs,
          content: [{ type: "paragraph" }],
        };
      }
      return {
        type: blockType,
        attrs: baseAttrs,
        content: [{ type: "paragraph" }],
      };
    }
  }
}

/**
 * Creates a TipTap addNodeView() factory function with shared block chrome.
 */
export function createBlockNodeView(options: BlockNodeViewOptions) {
  return ({
    node,
    getPos,
    editor,
  }: {
    node: ProseMirrorNode;
    getPos: (() => number | undefined) | boolean;
    editor: Editor;
    view: EditorView;
  }) => {
    // Auto-assign blockId if missing (e.g., block created before schema update)
    if (!node.attrs.blockId && typeof getPos === "function") {
      const pos = getPos();
      if (pos !== undefined) {
        const newId = crypto.randomUUID();
        const { tr } = editor.state;
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, blockId: newId });
        editor.view.dispatch(tr);
      }
    }

    // --- Outer wrapper: block-node chrome ---
    const dom = document.createElement("div");
    dom.classList.add("block-node", `block-${options.blockType}`);
    dom.setAttribute("data-block-type", options.blockType);
    dom.setAttribute("data-block-id", node.attrs.blockId || "");
    // containerAttr: toggle block-container-hidden based on a boolean attr
    if (options.containerAttr) {
      dom.classList.toggle("block-container-hidden", !node.attrs[options.containerAttr]);
    }

    const getNodePos = typeof getPos === "function" ? getPos : undefined;

    const cursorBefore = document.createElement("button");
    cursorBefore.classList.add("block-cursor-anchor", "block-cursor-anchor-before");
    cursorBefore.type = "button";
    cursorBefore.title = "Place cursor above";
    cursorBefore.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      selectBlockNode(editor, getNodePos);
    });
    dom.appendChild(cursorBefore);

    // --- "+" button ABOVE block ---
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
        if (pos !== undefined) {
          openBlockInsertMenu(editor, pos, insertAbove);
        }
      }
    });
    dom.appendChild(insertAbove);

    // --- Drag handle ---
    const dragHandle = document.createElement("div");
    dragHandle.classList.add("block-drag-handle");
    dragHandle.contentEditable = "false";
    dragHandle.innerHTML = "⠿";
    dragHandle.title = "Drag to reorder";
    dom.appendChild(dragHandle);

    // --- Block chrome header (type badge + menu) ---
    const chrome = document.createElement("div");
    chrome.classList.add("block-chrome");
    chrome.contentEditable = "false";

    const badge = document.createElement("span");
    badge.classList.add("block-type-badge");
    badge.textContent = options.label;
    chrome.appendChild(badge);

    const menuBtn = document.createElement("button");
    menuBtn.classList.add("block-menu-btn");
    menuBtn.textContent = "⋯";
    menuBtn.title = "Block properties";
    menuBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const blockId = node.attrs.blockId || "";
      useBlockStore.getState().setSelectedBlock(blockId, options.blockType);
      useBlockStore.getState().openProperties();
      useRightPanelCollapseStore.getState().setCollapsed(false);
      syncAttrsToPanel(blockId, node.attrs);
    });
    chrome.appendChild(menuBtn);

    // Delete button
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
            .deleteRange({ from: pos, to: pos + node.nodeSize })
            .run();
        }
      }
    });
    chrome.appendChild(deleteBtn);

    dom.appendChild(chrome);

    // --- Content area ---
    const contentDom = document.createElement("div");
    contentDom.classList.add("block-content");

    // Append to DOM FIRST so renderContent can use contentDom.parentElement
    dom.appendChild(contentDom);

    // Render block-specific content (may insert siblings via parentElement)
    options.renderContent(node, contentDom, editor, getNodePos);

    // --- "+" button BELOW block ---
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
          // Insert after this node
          const after = pos + node.nodeSize;
          openBlockInsertMenu(editor, after, insertBelow);
        }
      }
    });
    dom.appendChild(insertBelow);

    const cursorAfter = document.createElement("button");
    cursorAfter.classList.add("block-cursor-anchor", "block-cursor-anchor-after");
    cursorAfter.type = "button";
    cursorAfter.title = "Place cursor below";
    cursorAfter.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      selectBlockNode(editor, getNodePos);
    });
    dom.appendChild(cursorAfter);

    // --- Selection handling (chrome only, not content area) ---
    const syncBlockSelection = () => {
      const blockId = node.attrs.blockId || "";
      useBlockStore.getState().setSelectedBlock(blockId, options.blockType);
      syncAttrsToPanel(blockId, node.attrs);
    };

    // Clicking anywhere inside a block should update the selected block in the
    // properties sidebar, but should not force the right panel open.
    dom.addEventListener(
      "mousedown",
      (event) => {
        const target = event.target as HTMLElement;
        const interactive =
          target.closest(".block-menu-btn") ||
          target.closest(".block-delete-btn") ||
          target.closest(".block-insert-btn");
        if (interactive) return;
        syncBlockSelection();
      },
      true
    );

    chrome.addEventListener("click", syncBlockSelection);

    return {
      dom,
      // For non-atom blocks, ProseMirror needs a content hole
      contentDOM: options.atom ? undefined : contentDom,

      selectNode() {
        dom.classList.add("block-selected", "ProseMirror-selectednode");
        syncBlockSelection();
      },

      deselectNode() {
        dom.classList.remove("block-selected", "ProseMirror-selectednode");
      },

      // Prevent ProseMirror from stealing focus on form inputs (for atom blocks)
      stopEvent(event: Event) {
        if (!options.atom) return false;
        const target = event.target as HTMLElement;
        const isFormElement =
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement ||
          target instanceof HTMLButtonElement;
        return isFormElement;
      },

      update(updatedNode: ProseMirrorNode) {
        if (updatedNode.type.name !== node.type.name) return false;

        // Update the data attribute
        dom.setAttribute(
          "data-block-id",
          updatedNode.attrs.blockId || ""
        );

        // Sync containerAttr-driven visibility
        if (options.containerAttr) {
          dom.classList.toggle("block-container-hidden", !updatedNode.attrs[options.containerAttr]);
        }

        // Let the block handle its own content update
        if (options.updateContent) {
          const handled = options.updateContent(
            updatedNode,
            contentDom,
            editor,
            getNodePos
          );
          if (!handled) {
            // Re-render from scratch if update returns false
            contentDom.innerHTML = "";
            options.renderContent(updatedNode, contentDom, editor, getNodePos);
          }
        }

        node = updatedNode;
        return true;
      },

      destroy() {
        // Clean up if this block was selected
        const store = useBlockStore.getState();
        if (store.selectedBlockId === node.attrs.blockId) {
          store.clearSelection();
        }
        // Clean up any open insert menus
        const menu = document.querySelector(".block-insert-menu");
        if (menu) menu.remove();
      },
    };
  };
}
