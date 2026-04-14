/**
 * Block Focus Extension
 *
 * TipTap extension wrapper that:
 * 1. Registers the block-focus ProseMirror plugin (selection tracking)
 * 2. Listens for `block-attrs-change` CustomEvents from PropertiesPanel
 *    and inline-editable block elements, then applies the attr changes
 *    to the correct ProseMirror node via updateAttributes.
 *
 * Epoch 11 Sprint 43 (updated Sprint 44b: attrs bridge)
 */

import { Extension, type Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { createBlockFocusPlugin } from "../plugins/block-focus";

export const BlockFocusExtension = Extension.create({
  name: "blockFocus",

  addProseMirrorPlugins() {
    return [createBlockFocusPlugin()];
  },

  onCreate() {
    const editor = this.editor;

    // Listen for block attribute changes from PropertiesPanel or inline editors
    const handleAttrsChange = (e: Event) => {
      const { blockId, key, value } = (e as CustomEvent).detail;
      if (!blockId || !key) return;

      // Walk the document to find the node with matching blockId
      const { doc, tr } = editor.state;
      let found = false;

      doc.descendants((node, pos) => {
        if (found) return false;
        if (node.attrs.blockId === blockId) {
          // Handle structural changes for columns — add/remove column children
          if (node.type.name === "columns" && key === "columnCount") {
            const newCount = Number(value);
            const currentCount = node.childCount;

            // Update the attr first
            tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              [key]: newCount,
            });

            if (newCount > currentCount) {
              // Add new columns at the end
              const columnType = editor.state.schema.nodes.column;
              const paragraphType = editor.state.schema.nodes.paragraph;
              if (columnType && paragraphType) {
                for (let i = currentCount; i < newCount; i++) {
                  const newCol = columnType.create(null, [paragraphType.create()]);
                  // After setNodeMarkup, re-read the node from the transformed doc
                  const updatedNode = tr.doc.nodeAt(pos);
                  if (updatedNode) {
                    const insertPos = pos + updatedNode.nodeSize - 1;
                    tr.insert(insertPos, newCol);
                  }
                }
              }
            } else if (newCount < currentCount) {
              // Remove trailing columns from end to start (preserves positions)
              for (let i = currentCount - 1; i >= newCount; i--) {
                const updatedNode = tr.doc.nodeAt(pos);
                if (!updatedNode) break;
                // Walk to find the i-th child position
                let childPos = pos + 1;
                for (let j = 0; j < i; j++) {
                  childPos += updatedNode.child(j).nodeSize;
                }
                const child = updatedNode.child(i);
                tr.delete(childPos, childPos + child.nodeSize);
              }
            }
          } else {
            tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              [key]: value,
            });
          }
          found = true;
          return false;
        }
        return true;
      });

      if (found) {
        editor.view.dispatch(tr);

        // Dispatch block-attrs-update back so PropertiesPanel can sync
        const updatedNode = findNodeByBlockId(editor, blockId);
        if (updatedNode) {
          window.dispatchEvent(
            new CustomEvent("block-attrs-update", {
              detail: { blockId, attrs: updatedNode.attrs },
            })
          );
        }
      }
    };

    window.addEventListener("block-attrs-change", handleAttrsChange);

    // Store cleanup ref on the extension storage
    this.storage.cleanup = () => {
      window.removeEventListener("block-attrs-change", handleAttrsChange);
    };
  },

  onDestroy() {
    this.storage.cleanup?.();
  },

  addStorage() {
    return {
      cleanup: null as (() => void) | null,
    };
  },
});

/** Find a node by blockId in the current editor doc */
function findNodeByBlockId(
  editor: Editor,
  blockId: string
): { attrs: Record<string, unknown> } | null {
  let result: { attrs: Record<string, unknown> } | null = null;
  editor.state.doc.descendants((node: ProseMirrorNode) => {
    if (result) return false;
    if (node.attrs.blockId === blockId) {
      result = { attrs: node.attrs };
      return false;
    }
    return true;
  });
  return result;
}
