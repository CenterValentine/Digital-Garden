/**
 * Bullet List Backspace Extension
 *
 * Matches Obsidian behavior: backspacing in an empty bullet list item
 * converts it back to plain text "-" instead of deleting the bullet entirely.
 *
 * M6: Quality of life improvement for markdown-style editing.
 */

import { Extension } from "@tiptap/core";

export const BulletListBackspace = Extension.create({
  name: "bulletListBackspace",

  addKeyboardShortcuts() {
    return {
      Backspace: () => {
        const { state, dispatch } = this.editor.view;
        const { $from, empty } = state.selection;

        // Only handle backspace if:
        // 1. Selection is empty (cursor, not selection)
        // 2. We're in a list item
        // 3. We're in a bullet list (not ordered list or task list)
        // 4. Cursor is at the start of the list item (empty item)
        if (!empty) return false;

        const listItemNode = $from.node(-1);
        const listNode = $from.node(-2);

        // Check if we're in a bullet list item
        if (
          listItemNode?.type.name !== "listItem" ||
          listNode?.type.name !== "bulletList"
        ) {
          return false;
        }

        // Check if cursor is at start of list item and item is empty
        const isAtStart = $from.parentOffset === 0;
        const isEmpty = listItemNode.content.size === 0;

        if (!isAtStart || !isEmpty) {
          return false;
        }

        // Convert bullet list item back to paragraph with "-" text
        if (dispatch) {
          const { tr, schema } = state;
          const listItemPos = $from.before(-1);

          // Create paragraph with "-" text
          const paragraphNode = schema.nodes.paragraph.create(
            null,
            schema.text("-")
          );

          // Replace the list item with the paragraph
          tr.replaceWith(
            listItemPos,
            listItemPos + listItemNode.nodeSize,
            paragraphNode
          );

          // Set cursor after the "-" character
          const newPos = listItemPos + 2; // +1 for paragraph, +1 for "-" char
          tr.setSelection((state.selection.constructor as any).near(tr.doc.resolve(newPos)));

          dispatch(tr);
        }

        return true;
      },
    };
  },
});
