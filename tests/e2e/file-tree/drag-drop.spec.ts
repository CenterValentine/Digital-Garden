/**
 * STUB — file tree drag-and-drop reorder + reparent.
 *
 * Scope:
 *   - Dragging a note onto a folder reparents it
 *   - Dragging between folders updates displayOrder correctly
 *   - Dragging a folder into one of its descendants is rejected
 *   - Drop indicators show the correct insertion point during drag
 */

import { test } from "@playwright/test";

test.describe("file-tree: drag-drop", () => {
  test.skip("note dropped on folder reparents", async ({ page }) => {
    void page;
  });

  test.skip("dragging within folder updates displayOrder", async ({ page }) => {
    void page;
  });

  test.skip("rejects folder→descendant drops", async ({ page }) => {
    void page;
  });

  test.skip("drop indicator shows correct insertion point", async ({ page }) => {
    void page;
  });
});
