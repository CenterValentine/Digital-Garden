/**
 * STUB — markdown source-view toggle (v3.2 T2) UI-level conversion checks.
 *
 * The `markdown:blocks:check` CI gate already proves the converter round-trips
 * every registered block losslessly at the data layer. These Playwright cases
 * are the belt-and-suspenders UI layer: they drive the ACTUAL toggle button and
 * assert the on-screen result, catching wiring regressions the data-layer gate
 * can't see (e.g. the editor not receiving `setContent`, the toggle applying to
 * the wrong pane, or collab notes silently REST-writing).
 *
 * Scope:
 *   - Toggle "Markdown" → source view shows `tiptapToMarkdown(note)`; toggle
 *     "Rich text" → edits reflect in the rich-text editor with no content loss.
 *   - A note containing custom blocks (callout, Excalidraw, tag) round-trips
 *     through source view with the blocks intact (they appear as `dg-block`
 *     fences in source and restore identically) — the data-loss case the owner
 *     found on 2026-07-21.
 *   - A source edit that can't parse to structure surfaces the degraded toast
 *     ("saved as plain paragraphs"), never a silent drop.
 *   - Switching to a different note while in source mode returns to rich text
 *     (no stale draft applied to the new note).
 *   - Collab note (Hocuspocus live): a source edit propagates via the Y.doc
 *     (visible in a second client), NOT via a REST NotePayload write.
 *
 * Blocked on:
 *   - Auth fixture (tests/e2e/_fixtures/auth.ts) — the note editor is a
 *     signed-in surface (see dark-mode/authenticated-routes.spec.ts).
 *   - Seeded fixture content with known blocks for the round-trip assertions.
 *   - Hocuspocus test fixture for the collab-propagation case (shared with
 *     editor/collaboration.spec.ts).
 */

import { test } from "@playwright/test";

test.describe("editor: markdown source-view toggle", () => {
  test.skip("round-trips a formatted note through source view with no loss", async ({ page }) => {
    void page;
  });

  test.skip("preserves custom blocks (callout, excalidraw, tag) across the toggle", async ({ page }) => {
    void page;
  });

  test.skip("shows the degraded toast when source can't parse to structure", async ({ page }) => {
    void page;
  });

  /**
   * Regression (2026-07-26): after toggling back from source view, the table
   * bubble menu appeared with EVERY button disabled, so a round-tripped table
   * couldn't be edited. The document was fine — `can().addRowAfter()` was true
   * throughout. TipTap v3 defaults `shouldRerenderOnTransaction` to false, so
   * React never re-rendered on the selection change, and `applySourceMode`
   * passes `emitUpdate: false`, so nothing else re-rendered either; the buttons
   * kept the `disabled` values computed while the caret was outside the table.
   *
   * Assert the ENABLED state and that a click mutates the table — a snapshot of
   * the menu proves nothing, since the broken build rendered the same pixels
   * modulo opacity.
   */
  test.skip("keeps table controls live after toggling back from source view", async ({ page }) => {
    void page;
  });

  test.skip("returns to rich text when navigating to another note mid-source-edit", async ({ page }) => {
    void page;
  });

  test.skip("propagates a collab-note source edit via the Y.doc, not REST", async ({ page }) => {
    void page;
  });
});
