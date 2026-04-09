/**
 * Block Focus Plugin
 *
 * ProseMirror plugin that tracks block node selection and syncs
 * with the block-store. Adds `block-selected` CSS class decoration
 * to the currently selected block node.
 *
 * Epoch 11 Sprint 43
 */

import { NodeSelection, Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { useBlockStore } from "@/state/block-store";

export const blockFocusPluginKey = new PluginKey("blockFocus");

function syncSelectedBlockAttrs(blockId: string, attrs: Record<string, unknown>) {
  requestAnimationFrame(() => {
    window.dispatchEvent(
      new CustomEvent("block-attrs-update", {
        detail: { blockId, attrs },
      })
    );
  });
}

/**
 * Creates a ProseMirror plugin that:
 * 1. Detects when a block node is selected (NodeSelection)
 * 2. Updates the Zustand block-store with the selected block info
 * 3. Adds a `block-focused` CSS class decoration for visual feedback
 */
export function createBlockFocusPlugin() {
  return new Plugin({
    key: blockFocusPluginKey,

    state: {
      init() {
        return DecorationSet.empty;
      },

      apply(tr, oldDecorations, _oldState, newState) {
        // Check if selection is a NodeSelection on a block node
        const { selection } = newState;
        const node = selection instanceof NodeSelection ? selection.node : null;

        if (node && node.attrs && typeof node.attrs.blockType === "string") {
          // Block node is selected — add decoration and update store
          const pos = selection.from;
          const decoration = Decoration.node(pos, pos + node.nodeSize, {
            class: "block-focused",
          });

          // Update the Zustand store (only if changed)
          const store = useBlockStore.getState();
          if (store.selectedBlockId !== node.attrs.blockId) {
            useBlockStore
              .getState()
              .setSelectedBlock(node.attrs.blockId, node.attrs.blockType);
          }
          if (node.attrs.blockId) {
            syncSelectedBlockAttrs(node.attrs.blockId, node.attrs);
          }

          return DecorationSet.create(newState.doc, [decoration]);
        }

        // No block selected — clear if we had one
        if (oldDecorations !== DecorationSet.empty) {
          useBlockStore.getState().clearSelection();
        }
        return DecorationSet.empty;
      },
    },

    props: {
      decorations(state) {
        return this.getState(state);
      },
    },
  });
}
