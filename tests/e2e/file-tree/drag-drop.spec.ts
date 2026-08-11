/**
 * STUB — file tree drag-and-drop reorder + reparent.
 *
 * Scope:
 *   - Dragging a note onto a folder reparents it
 *   - Dragging between folders updates displayOrder correctly
 *   - Dragging a folder into one of its descendants is rejected
 *   - Drop indicators show the correct insertion point during drag
 *   - Dragging a tree node onto a pane's tab strip opens it as a pinned tab
 *     at the insertion caret (before/between/after tabs; per-pane targeting;
 *     multi-selection opens all dragged nodes in selection order)
 *
 * Blocked on: auth fixture + seeded fixture content (see tests/e2e/README.md).
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

  test.skip("tree node dropped on tab strip opens pinned tab at caret", async ({ page }) => {
    void page;
  });
});
