/**
 * Block Focus Plugin
 *
 * ProseMirror plugin that tracks block node selection and syncs
 * with the block-store. Adds `block-selected` CSS class decoration
 * to the currently selected block node.
 *
 * Epoch 11 Sprint 43
 */

import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { useBlockStore } from "@/state/block-store";

export const blockFocusPluginKey = new PluginKey("blockFocus");

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
        const node = selection instanceof Object && "node" in selection
          ? (selection as any).node
          : null;

        if (node && node.attrs && typeof node.attrs.blockType === "string") {
          // Block node is selected — add decoration and update store
          const pos = (selection as any).from;
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
