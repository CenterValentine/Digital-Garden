import { Extension, type Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model";
import { useBlockStore } from "@/state/block-store";

function isCustomBlock(node: ProseMirrorNode | null | undefined) {
  return Boolean(node?.attrs && typeof node.attrs.blockType === "string");
}

function getSiblingNodes($from: ResolvedPos) {
  const depth = $from.depth;
  if (depth < 1) return null;

  const parentDepth = depth - 1;
  const container = $from.node(parentDepth);
  const index = $from.index(parentDepth);

  return {
    depth,
    index,
    paragraphFrom: $from.before(depth),
    paragraphTo: $from.after(depth),
    container,
    previousSibling: index > 0 ? container.child(index - 1) : null,
    nextSibling: index < container.childCount - 1 ? container.child(index + 1) : null,
  };
}

function deleteSpacerParagraph(editor: Editor, direction: "backward" | "forward") {
  const { state, view } = editor;
  const { selection } = state;
  const { $from, empty } = selection;

  if (!empty) return false;
  if ($from.parent.type.name !== "paragraph") return false;
  if ($from.parent.content.size !== 0 || $from.parent.textContent.length !== 0) return false;

  if (direction === "backward" && $from.parentOffset !== 0) return false;
  if (direction === "forward" && $from.parentOffset !== $from.parent.content.size) return false;

  const siblings = getSiblingNodes($from);
  if (!siblings) return false;

  const { paragraphFrom, paragraphTo, previousSibling, nextSibling } = siblings;
  if (!isCustomBlock(previousSibling) && !isCustomBlock(nextSibling)) {
    return false;
  }

  const tr = state.tr.delete(paragraphFrom, paragraphTo);
  let targetNode: ProseMirrorNode | null = null;
  let targetPos: number | null = null;

  if (direction === "backward" && previousSibling && isCustomBlock(previousSibling)) {
    targetNode = previousSibling;
    targetPos = paragraphFrom - previousSibling.nodeSize;
  } else if (direction === "forward" && nextSibling && isCustomBlock(nextSibling)) {
    targetNode = nextSibling;
    targetPos = paragraphFrom;
  } else if (previousSibling && isCustomBlock(previousSibling)) {
    targetNode = previousSibling;
    targetPos = paragraphFrom - previousSibling.nodeSize;
  } else if (nextSibling && isCustomBlock(nextSibling)) {
    targetNode = nextSibling;
    targetPos = paragraphFrom;
  }

  if (targetNode && targetPos !== null) {
    tr.setSelection(NodeSelection.create(tr.doc, targetPos));
    if (typeof targetNode.attrs.blockId === "string") {
      useBlockStore
        .getState()
        .setSelectedBlock(targetNode.attrs.blockId, String(targetNode.attrs.blockType || ""));
    }
  }

  view.dispatch(tr);
  return true;
}

export const BlockSpacerGuard = Extension.create({
  name: "blockSpacerGuard",

  addKeyboardShortcuts() {
    return {
      Backspace: () => deleteSpacerParagraph(this.editor, "backward"),
      Delete: () => deleteSpacerParagraph(this.editor, "forward"),
    };
  },
});
