/**
 * Task List Input Rule Extension
 *
 * Converts markdown-style task list syntax to TipTap task lists.
 * Handles two patterns:
 * 1. Direct: `- [ ]` + space → task list (if bullet list didn't trigger first)
 * 2. Bullet conversion: Typing `[ ]` or `[x]` in a bullet list → converts to task list
 */

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

export const TaskListInputRule = Extension.create({
  name: "taskListInputRule",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("taskListInputRule"),
        props: {
          handleTextInput(view, from, to, text) {
            const { state, dispatch } = view;
            const { tr, schema } = state;
            const $from = state.doc.resolve(from);

            // Check if we have the required node types
            if (!schema.nodes.taskList || !schema.nodes.taskItem) {
              return false;
            }

            // PATTERN 1: Direct markdown `- [ ]` + space (before bullet list triggers)
            // This rarely works because bullet list input rule fires first on `- `
            if (text === " ") {
              const textBefore = $from.parent.textContent.slice(0, $from.parentOffset);
              const uncheckedMatch = textBefore.match(/^- \[\s?\]$/);
              const checkedMatch = textBefore.match(/^- \[x\]$/i);

              if (uncheckedMatch || checkedMatch) {
                const matchLength = (uncheckedMatch || checkedMatch)![0].length;
                const deleteFrom = from - matchLength;

                tr.delete(deleteFrom, from);

                const taskItemNode = schema.nodes.taskItem.create(
                  { checked: !!checkedMatch },
                  schema.nodes.paragraph.create()
                );

                const taskListNode = schema.nodes.taskList.create(null, taskItemNode);

                tr.replaceWith(deleteFrom, deleteFrom, taskListNode);
                tr.setSelection(
                  state.selection.constructor.near(tr.doc.resolve(deleteFrom + 2))
                );

                if (dispatch) {
                  dispatch(tr);
                }

                return true;
              }
            }

            // PATTERN 2: Convert bullet list to task list when user types `[ ]` or `[x]` + space
            // This handles the common case where bullet list already triggered on `- `
            if (text === " ") {
              const textBefore = $from.parent.textContent.slice(0, $from.parentOffset);

              // Check if we're in a bullet list item
              const inBulletList = $from.node(-1)?.type.name === "listItem" &&
                                   $from.node(-2)?.type.name === "bulletList";

              if (!inBulletList) {
                return false;
              }

              // Check for checkbox patterns at start of bullet content
              const uncheckedMatch = textBefore.match(/^\[\s?\]$/);
              const checkedMatch = textBefore.match(/^\[x\]$/i);

              if (!uncheckedMatch && !checkedMatch) {
                return false;
              }

              // Get the position of the list item
              const listItemPos = $from.before(-1);
              const listItemNode = $from.node(-1);

              // Delete the checkbox text
              const matchLength = (uncheckedMatch || checkedMatch)![0].length;
              const deleteFrom = from - matchLength;
              tr.delete(deleteFrom, from);

              // Convert listItem to taskItem
              const taskItemNode = schema.nodes.taskItem.create(
                { checked: !!checkedMatch },
                listItemNode.content
              );

              // Replace the listItem with taskItem
              tr.replaceWith(listItemPos, listItemPos + listItemNode.nodeSize, taskItemNode);

              // Convert bulletList parent to taskList if it isn't already
              const bulletListPos = $from.before(-2);
              const bulletListNode = $from.node(-2);

              // Only convert if it's actually a bulletList
              if (bulletListNode.type.name === "bulletList") {
                const taskListNode = schema.nodes.taskList.create(
                  bulletListNode.attrs,
                  bulletListNode.content
                );
                tr.replaceWith(bulletListPos, bulletListPos + bulletListNode.nodeSize, taskListNode);
              }

              // Set cursor position inside the new task item
              const newPos = tr.doc.resolve(listItemPos + 2);
              tr.setSelection(state.selection.constructor.near(newPos));

              if (dispatch) {
                dispatch(tr);
              }

              return true;
            }

            return false;
          },
        },
      }),
    ];
  },
});
