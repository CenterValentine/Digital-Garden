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
                  (state.selection.constructor as any).near(tr.doc.resolve(deleteFrom + 2))
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

              // Delete the checkbox text first
              const matchLength = (uncheckedMatch || checkedMatch)![0].length;
              const deleteFrom = from - matchLength;
              tr.delete(deleteFrom, from);

              // Now work with the updated document after deletion
              const $fromAfterDelete = tr.doc.resolve(deleteFrom);
              const listItemAfterDelete = $fromAfterDelete.node(-1);

              // Convert listItem to taskItem with the cleaned content
              const taskItemNode = schema.nodes.taskItem.create(
                { checked: !!checkedMatch },
                listItemAfterDelete.content
              );

              // Replace the listItem with taskItem
              const listItemPosAfterDelete = $fromAfterDelete.before(-1);
              tr.replaceWith(listItemPosAfterDelete, listItemPosAfterDelete + listItemAfterDelete.nodeSize, taskItemNode);

              // Convert bulletList parent to taskList if it isn't already
              const bulletListNode = $from.node(-2);

              // Only convert if it's actually a bulletList
              if (bulletListNode && bulletListNode.type.name === "bulletList") {
                // After replacing the listItem with taskItem, we need to find the bulletList in the updated doc
                // Resolve to a position inside the paragraph within the taskItem
                const $insideTaskItem = tr.doc.resolve(listItemPosAfterDelete + 2);

                // Navigate up: paragraph -> taskItem -> bulletList
                // So bulletList is at depth -2 from the paragraph
                if ($insideTaskItem.depth >= 2) {
                  const parentAtDepthMinus1 = $insideTaskItem.node(-1); // Should be taskItem
                  const parentAtDepthMinus2 = $insideTaskItem.node(-2); // Should be bulletList

                  if (parentAtDepthMinus2?.type.name === "bulletList") {
                    const updatedBulletListPos = $insideTaskItem.before(-2);
                    const updatedBulletList = parentAtDepthMinus2;

                    const taskListNode = schema.nodes.taskList.create(
                      updatedBulletList.attrs,
                      updatedBulletList.content
                    );
                    tr.replaceWith(updatedBulletListPos, updatedBulletListPos + updatedBulletList.nodeSize, taskListNode);

                    // Set cursor position inside the new task item's paragraph
                    const newPos = tr.doc.resolve(updatedBulletListPos + 4); // taskList + taskItem + paragraph
                    tr.setSelection((state.selection.constructor as any).near(newPos));
                  } else {
                    // Fallback: just position cursor in the taskItem
                    const newPos = tr.doc.resolve(listItemPosAfterDelete + 2);
                    tr.setSelection((state.selection.constructor as any).near(newPos));
                  }
                } else {
                  // Fallback: just position cursor in the taskItem
                  const newPos = tr.doc.resolve(listItemPosAfterDelete + 2);
                  tr.setSelection((state.selection.constructor as any).near(newPos));
                }
              } else {
                // No bulletList conversion needed, just position cursor
                const newPos = tr.doc.resolve(listItemPosAfterDelete + 2);
                tr.setSelection((state.selection.constructor as any).near(newPos));
              }

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
