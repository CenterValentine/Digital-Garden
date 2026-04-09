import { Extension, type Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import {
  moveCursorToAdjacentParagraphAroundBlock,
  placeCursorAroundBlock,
} from "@/lib/domain/blocks/node-view-factory";
import { useBlockStore } from "@/state/block-store";

function isCustomBlock(node: ProseMirrorNode | null | undefined) {
  return Boolean(node?.attrs && typeof node.attrs.blockType === "string");
}

function resolveAccordionOpen(attrs: Record<string, unknown>) {
  if (attrs.openBehavior === "expanded") return true;
  if (attrs.openBehavior === "collapsed") return false;
  return attrs.openState !== false;
}

function selectAdjacentBlockNode(
  editor: Editor,
  pos: number,
  node: ProseMirrorNode
) {
  editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)));
  if (typeof node.attrs.blockId === "string") {
    useBlockStore.getState().setSelectedBlock(node.attrs.blockId, String(node.attrs.blockType || ""));
  }
}

function findAdjacentCustomBlock(
  editor: Editor,
  direction: "up" | "down"
): { node: ProseMirrorNode; pos: number } | null {
  const { selection } = editor.state;
  if (!selection.empty) return null;
  const { $from } = selection;
  if ($from.parent.type.name !== "paragraph") return null;
  if (direction === "up" && $from.parentOffset !== 0) return null;
  if (direction === "down" && $from.parentOffset !== $from.parent.content.size) return null;
  if ($from.depth < 1) return null;

  const depth = $from.depth;
  const parentDepth = depth - 1;
  const container = $from.node(parentDepth);
  const index = $from.index(parentDepth);
  const paragraphFrom = $from.before(depth);
  const paragraphTo = $from.after(depth);

  if (direction === "up") {
    if (index <= 0) return null;
    const previousNode = container.child(index - 1);
    if (!isCustomBlock(previousNode)) return null;
    return { node: previousNode, pos: paragraphFrom - previousNode.nodeSize };
  }

  if (index >= container.childCount - 1) return null;
  const nextNode = container.child(index + 1);
  if (!isCustomBlock(nextNode)) return null;
  return { node: nextNode, pos: paragraphTo };
}

function findHorizontalAdjacentCustomBlock(
  editor: Editor,
  direction: "left" | "right"
): { node: ProseMirrorNode; pos: number } | null {
  const { selection } = editor.state;
  if (!selection.empty) return null;
  const { $from } = selection;
  if ($from.parent.type.name !== "paragraph") return null;
  if (direction === "left" && $from.parentOffset !== 0) return null;
  if (direction === "right" && $from.parentOffset !== $from.parent.content.size) return null;
  if ($from.depth < 1) return null;

  const depth = $from.depth;
  const parentDepth = depth - 1;
  const container = $from.node(parentDepth);
  const index = $from.index(parentDepth);
  const paragraphFrom = $from.before(depth);
  const paragraphTo = $from.after(depth);

  if (direction === "left") {
    if (index <= 0) return null;
    const previousNode = container.child(index - 1);
    if (!isCustomBlock(previousNode)) return null;
    return { node: previousNode, pos: paragraphFrom - previousNode.nodeSize };
  }

  if (index >= container.childCount - 1) return null;
  const nextNode = container.child(index + 1);
  if (!isCustomBlock(nextNode)) return null;
  return { node: nextNode, pos: paragraphTo };
}

function findContainingClosedAccordion(
  editor: Editor
): { node: ProseMirrorNode; pos: number } | null {
  const { selection } = editor.state;
  if (!selection.empty) return null;
  const { $from } = selection;

  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (node.type.name !== "accordion") continue;
    if (resolveAccordionOpen(node.attrs)) return null;
    return { node, pos: $from.before(depth) };
  }

  return null;
}

function openSelectedAccordionAndFocus(
  editor: Editor,
  node: ProseMirrorNode,
  pos: number,
  target: "title" | "end"
) {
  const blockId = String(node.attrs.blockId || "");
  const nextOpenBehavior =
    node.attrs.openBehavior === "collapsed" ? "lastInteraction" : node.attrs.openBehavior;

  editor.view.dispatch(
    editor.state.tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      openBehavior: nextOpenBehavior,
      openState: true,
    })
  );

  if (target === "title") {
    const focusTitle = () => {
    const title = document.querySelector(
      `[data-block-id="${CSS.escape(blockId)}"] .block-accordion-title`
    ) as HTMLElement | null;
      if (!title) return false;
      title.focus({ preventScroll: true });
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(title);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
      return true;
    };

    if (!focusTitle()) {
      requestAnimationFrame(() => {
        if (!focusTitle()) {
          setTimeout(() => {
            focusTitle();
          }, 0);
        }
      });
    }
    return true;
  }

  const targetPos = Math.max(pos + 2, pos + node.nodeSize - 2);
  editor.view.dispatch(
    editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(targetPos), -1))
  );
  (editor.view.dom as HTMLElement).focus({ preventScroll: true });
  return true;
}

function getTabsRoot(blockId: string) {
  if (!blockId) return null;
  return document.querySelector(
    `[data-block-id="${CSS.escape(blockId)}"][data-block-type="tabs"]`
  ) as HTMLElement | null;
}

function focusTabsButton(blockId: string, index: number) {
  const root = getTabsRoot(blockId);
  if (!root) return false;
  const buttons = root.querySelectorAll<HTMLButtonElement>(".block-tab-btn");
  const button = buttons[index];
  if (!button) return false;
  button.focus({ preventScroll: true });
  return true;
}

function getKeyboardTabSurfaceIndex(blockId: string) {
  const root = getTabsRoot(blockId);
  if (!root) return null;
  const value = root.getAttribute("data-keyboard-tab-index");
  if (value == null) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function getKeyboardTabSurfaceMode(blockId: string) {
  const root = getTabsRoot(blockId);
  if (!root) return null;
  const value = root.getAttribute("data-keyboard-tab-mode");
  return value === "selector" || value === "tab" ? value : null;
}

function setKeyboardTabSurfaceState(
  blockId: string,
  mode: "selector" | "tab" | null,
  index: number | null
) {
  const root = getTabsRoot(blockId);
  if (!root) return;
  if (mode == null) {
    root.removeAttribute("data-keyboard-tab-mode");
    root.removeAttribute("data-keyboard-tab-index");
    return;
  }
  root.setAttribute("data-keyboard-tab-mode", mode);
  if (index == null) {
    root.removeAttribute("data-keyboard-tab-index");
    return;
  }
  root.setAttribute("data-keyboard-tab-index", String(index));
}

function setSelectedTabsActiveIndex(
  editor: Editor,
  node: ProseMirrorNode,
  pos: number,
  index: number
) {
  const nextIndex = Math.max(0, Math.min(index, node.childCount - 1));
  const tr = editor.state.tr.setNodeMarkup(pos, undefined, {
    ...node.attrs,
    activeTab: nextIndex,
  });
  editor.view.dispatch(tr);
}

function focusSelectedTabLabel(blockId: string, index: number) {
  const root = getTabsRoot(blockId);
  if (!root) return false;
  const labels = root.querySelectorAll(".block-tab-label");
  const label = labels[index] as HTMLElement | undefined;
  if (!label) return false;

  label.contentEditable = "true";
  label.focus();
  const range = document.createRange();
  range.selectNodeContents(label);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  return true;
}

function moveSelectionIntoTabContent(
  editor: Editor,
  node: ProseMirrorNode,
  pos: number,
  index: number
) {
  let offset = 1;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (i === index) {
      const panelFrom = pos + offset;
      const targetPos = Math.min(panelFrom + 1, editor.state.doc.content.size);
      const tr = editor.state.tr.setSelection(
        TextSelection.near(editor.state.doc.resolve(targetPos), 1)
      );
      editor.view.dispatch(tr);
      (editor.view.dom as HTMLElement).focus({ preventScroll: true });
      return true;
    }
    offset += child.nodeSize;
  }
  return false;
}

function setSelectedTabsSurfaceIndex(
  editor: Editor,
  node: ProseMirrorNode,
  pos: number,
  index: number
) {
  const blockId = String(node.attrs.blockId || "");
  const nextIndex = Math.max(0, Math.min(index, node.childCount - 1));
  setSelectedTabsActiveIndex(editor, node, pos, nextIndex);
  useBlockStore.getState().setSelectedBlock(blockId, "tabs");
  setKeyboardTabSurfaceState(blockId, "tab", nextIndex);
  requestAnimationFrame(() => {
    focusTabsButton(blockId, nextIndex);
  });
  return true;
}

function handleSelectedTabsUpDown(
  editor: Editor,
  node: ProseMirrorNode,
  pos: number,
  direction: "up" | "down"
) {
  const blockId = String(node.attrs.blockId || "");
  const navIndex = getKeyboardTabSurfaceIndex(blockId);
  const mode = getKeyboardTabSurfaceMode(blockId);

  if (navIndex == null && mode === "selector") {
    setKeyboardTabSurfaceState(blockId, null, null);
    return moveCursorToAdjacentParagraphAroundBlock(
      editor,
      () => pos,
      node,
      direction === "up" ? "before" : "after"
    ) || true;
  }

  if (navIndex == null) {
    return setSelectedTabsSurfaceIndex(
      editor,
      node,
      pos,
      direction === "up" ? node.childCount - 1 : 0
    );
  }

  const nextIndex = navIndex + (direction === "up" ? -1 : 1);
  if (nextIndex >= 0 && nextIndex < node.childCount) {
    return setSelectedTabsSurfaceIndex(editor, node, pos, nextIndex);
  }

  setKeyboardTabSurfaceState(blockId, "selector", null);
  return true;
}

function handleSelectedTabsArrow(
  editor: Editor,
  node: ProseMirrorNode,
  pos: number,
  direction: "left" | "right"
) {
  const blockId = String(node.attrs.blockId || "");
  const navIndex = getKeyboardTabSurfaceIndex(blockId);
  const mode = getKeyboardTabSurfaceMode(blockId);

  if (navIndex != null && mode === "tab") {
    if (direction === "left") {
      return focusSelectedTabLabel(blockId, navIndex);
    }
    setKeyboardTabSurfaceState(blockId, null, null);
    return moveSelectionIntoTabContent(editor, node, pos, navIndex);
  }

  setKeyboardTabSurfaceState(blockId, null, null);
  return moveCursorToAdjacentParagraphAroundBlock(
    editor,
    () => pos,
    node,
    direction === "left" ? "before" : "after"
  ) || true;
}

function createEmptyParagraph(editor: Editor) {
  return editor.state.schema.nodes.paragraph?.create();
}

function createTextParagraph(editor: Editor, text: string) {
  const paragraph = editor.state.schema.nodes.paragraph;
  if (!paragraph) return null;
  return paragraph.create(
    null,
    text.trim().length > 0 ? editor.state.schema.text(text) : undefined
  );
}

function flattenAccordion(editor: Editor, node: ProseMirrorNode) {
  const nodes: ProseMirrorNode[] = [];
  const headerText = String(node.attrs.headerText || "").trim();
  if (headerText.length > 0) {
    const header = createTextParagraph(editor, headerText);
    if (header) nodes.push(header);
  }
  node.forEach((child) => nodes.push(child));
  return nodes;
}

function flattenColumns(editor: Editor, node: ProseMirrorNode) {
  const nodes: ProseMirrorNode[] = [];

  node.forEach((column, _offset, index) => {
    if (index > 0) {
      const separator = createEmptyParagraph(editor);
      if (separator) {
        nodes.push(separator);
      }
    }
    column.forEach((child) => nodes.push(child));
  });

  return nodes;
}

function flattenTabs(editor: Editor, node: ProseMirrorNode) {
  const nodes: ProseMirrorNode[] = [];

  node.forEach((panel, _offset, index) => {
    if (index > 0) {
      const separator = createEmptyParagraph(editor);
      if (separator) {
        nodes.push(separator);
      }
    }

    const label = createTextParagraph(editor, String(panel.attrs.label || "Tab"));
    if (label) {
      nodes.push(label);
    }

    panel.forEach((child) => nodes.push(child));
  });

  return nodes;
}

function flattenBlockColumns(editor: Editor, node: ProseMirrorNode) {
  const nodes: ProseMirrorNode[] = [];

  node.forEach((column, _offset, index) => {
    if (index > 0) {
      const separator = createEmptyParagraph(editor);
      if (separator) {
        nodes.push(separator);
      }
    }
    column.forEach((child) => nodes.push(child));
  });

  return nodes;
}

function destructureSelectedLayoutBlock(editor: Editor) {
  const { state, view } = editor;
  const { selection } = state;
  if (!(selection instanceof NodeSelection) || !isCustomBlock(selection.node)) {
    return false;
  }

  let replacement: ProseMirrorNode[] | null = null;
  switch (selection.node.type.name) {
    case "accordion":
      replacement = flattenAccordion(editor, selection.node);
      break;
    case "tabs":
      replacement = flattenTabs(editor, selection.node);
      break;
    case "columns":
      replacement = flattenColumns(editor, selection.node);
      break;
    case "blockColumns":
      replacement = flattenBlockColumns(editor, selection.node);
      break;
    default:
      return false;
  }

  if (!replacement || replacement.length === 0) {
    const fallbackParagraph = createEmptyParagraph(editor);
    if (!fallbackParagraph) return false;
    replacement = [fallbackParagraph];
  }

  const tr = state.tr.replaceWith(selection.from, selection.to, replacement);
  const targetPos = Math.min(selection.from + 1, tr.doc.content.size);
  tr.setSelection(TextSelection.near(tr.doc.resolve(targetPos), 1));
  view.dispatch(tr);
  view.focus();
  useBlockStore.getState().clearSelection();
  return true;
}

function handleSelectedBlockHorizontalArrow(
  editor: Editor,
  direction: "left" | "right"
) {
  const { selection } = editor.state;
  if (!(selection instanceof NodeSelection) || !isCustomBlock(selection.node)) {
    return false;
  }

  if (selection.node.type.name === "tabs") {
    return handleSelectedTabsArrow(
      editor,
      selection.node,
      selection.from,
      direction
    );
  }

  if (selection.node.type.name === "accordion") {
    return openSelectedAccordionAndFocus(
      editor,
      selection.node,
      selection.from,
      direction === "left" ? "title" : "end"
    );
  }

  return (
    moveCursorToAdjacentParagraphAroundBlock(
      editor,
      () => selection.from,
      selection.node,
      direction === "left" ? "before" : "after"
    ) || true
  );
}

function handleParagraphBoundaryHorizontalArrow(
  editor: Editor,
  direction: "left" | "right"
) {
  const adjacent = findHorizontalAdjacentCustomBlock(editor, direction);
  if (!adjacent) return false;

  if (adjacent.node.type.name === "accordion") {
    const target =
      direction === "right"
        ? "title"
        : resolveAccordionOpen(adjacent.node.attrs)
          ? "end"
          : "title";
    return openSelectedAccordionAndFocus(
      editor,
      adjacent.node,
      adjacent.pos,
      target
    );
  }

  selectAdjacentBlockNode(editor, adjacent.pos, adjacent.node);
  return true;
}

export const BlockBoundaryInsert = Extension.create({
  name: "blockBoundaryInsert",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("blockBoundaryInsertArrowKeys"),
        props: {
          handleKeyDown: (_view, event) => {
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              const direction = event.key === "ArrowUp" ? "up" : "down";
              const { selection } = this.editor.state;

              if (selection instanceof NodeSelection && selection.node.type.name === "tabs") {
                return handleSelectedTabsUpDown(
                  this.editor,
                  selection.node,
                  selection.from,
                  direction
                );
              }

              if (selection instanceof NodeSelection && isCustomBlock(selection.node)) {
                return moveCursorToAdjacentParagraphAroundBlock(
                  this.editor,
                  () => selection.from,
                  selection.node,
                  direction === "up" ? "before" : "after"
                );
              }

              const trappedClosedAccordion = findContainingClosedAccordion(this.editor);
              if (trappedClosedAccordion) {
                selectAdjacentBlockNode(
                  this.editor,
                  trappedClosedAccordion.pos,
                  trappedClosedAccordion.node
                );
                return true;
              }

              const adjacent = findAdjacentCustomBlock(this.editor, direction);
              if (!adjacent) return false;
              if (adjacent.node.type.name === "tabs") {
                return handleSelectedTabsUpDown(
                  this.editor,
                  adjacent.node,
                  adjacent.pos,
                  direction
                );
              }
              selectAdjacentBlockNode(this.editor, adjacent.pos, adjacent.node);
              return true;
            }

            if (event.key === "ArrowLeft") {
              return (
                handleSelectedBlockHorizontalArrow(this.editor, "left") ||
                handleParagraphBoundaryHorizontalArrow(this.editor, "left")
              );
            }
            if (event.key === "ArrowRight") {
              return (
                handleSelectedBlockHorizontalArrow(this.editor, "right") ||
                handleParagraphBoundaryHorizontalArrow(this.editor, "right")
              );
            }
            return false;
          },
        },
      }),
    ];
  },

  addKeyboardShortcuts() {
    return {
      Backspace: () => destructureSelectedLayoutBlock(this.editor),
      Enter: () => {
        const { selection } = this.editor.state;
        if (!(selection instanceof NodeSelection)) return false;
        if (typeof selection.node.attrs?.blockType !== "string") return false;

        placeCursorAroundBlock(
          this.editor,
          () => selection.from,
          selection.node,
          "after"
        );
        return true;
      },
      "Shift-Enter": () => {
        const { selection } = this.editor.state;
        if (!(selection instanceof NodeSelection)) return false;
        if (typeof selection.node.attrs?.blockType !== "string") return false;

        placeCursorAroundBlock(
          this.editor,
          () => selection.from,
          selection.node,
          "before"
        );
        return true;
      },
      ArrowUp: () => {
        const { selection } = this.editor.state;
        if (selection instanceof NodeSelection && selection.node.type.name === "tabs") {
          return handleSelectedTabsUpDown(
            this.editor,
            selection.node,
            selection.from,
            "up"
          );
        }
        if (selection instanceof NodeSelection && isCustomBlock(selection.node)) {
          return moveCursorToAdjacentParagraphAroundBlock(
            this.editor,
            () => selection.from,
            selection.node,
            "before"
          );
        }

        const trappedClosedAccordion = findContainingClosedAccordion(this.editor);
        if (trappedClosedAccordion) {
          selectAdjacentBlockNode(this.editor, trappedClosedAccordion.pos, trappedClosedAccordion.node);
          return true;
        }

        const adjacent = findAdjacentCustomBlock(this.editor, "up");
        if (!adjacent) return false;
        if (adjacent.node.type.name === "tabs") {
          return handleSelectedTabsUpDown(
            this.editor,
            adjacent.node,
            adjacent.pos,
            "up"
          );
        }
        selectAdjacentBlockNode(this.editor, adjacent.pos, adjacent.node);
        return true;
      },
      ArrowDown: () => {
        const { selection } = this.editor.state;
        if (selection instanceof NodeSelection && selection.node.type.name === "tabs") {
          return handleSelectedTabsUpDown(
            this.editor,
            selection.node,
            selection.from,
            "down"
          );
        }
        if (selection instanceof NodeSelection && isCustomBlock(selection.node)) {
          return moveCursorToAdjacentParagraphAroundBlock(
            this.editor,
            () => selection.from,
            selection.node,
            "after"
          );
        }

        const trappedClosedAccordion = findContainingClosedAccordion(this.editor);
        if (trappedClosedAccordion) {
          selectAdjacentBlockNode(this.editor, trappedClosedAccordion.pos, trappedClosedAccordion.node);
          return true;
        }

        const adjacent = findAdjacentCustomBlock(this.editor, "down");
        if (!adjacent) return false;
        if (adjacent.node.type.name === "tabs") {
          return handleSelectedTabsUpDown(
            this.editor,
            adjacent.node,
            adjacent.pos,
            "down"
          );
        }
        selectAdjacentBlockNode(this.editor, adjacent.pos, adjacent.node);
        return true;
      },
      ArrowLeft: () => {
        return handleSelectedBlockHorizontalArrow(this.editor, "left");
      },
      ArrowRight: () => {
        return handleSelectedBlockHorizontalArrow(this.editor, "right");
      },
    };
  },
});
