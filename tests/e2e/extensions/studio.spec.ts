/**
 * STUB — Folder Studio extension (Phase 1 surfaces).
 *
 * Scope:
 *   - Studio tab appears in the right sidebar for folders (and only folders)
 *   - Context tab appears for folders, notes, files, html, code, external
 *   - Three-shelf grid renders every registered tool from the registry
 *   - Tool tile expands an inline sheet with variants + execution mode
 *   - Source chip shows real counts/sizes for the selected folder
 *   - Disabling the studio extension removes both tabs
 *   - Both tabs render correctly in light and dark themes
 *   - Width-fluid layout survives the <768px sheet presentation
 *
 * Blocked on: auth fixture (tests/e2e/_fixtures/auth.ts) — all studio
 * surfaces live behind authenticated routes; plus seeded folder content
 * for deterministic source-chip counts.
 */

import { test } from "@playwright/test";

test.describe("extensions: folder studio", () => {
  test.skip("studio tab appears for folders only", async ({ page }) => {
    void page;
  });

  test.skip("context tab appears for supported content types", async ({ page }) => {
    void page;
  });

  test.skip("shelf grid renders all registered tools", async ({ page }) => {
    void page;
  });

  test.skip("tool tile expands variant sheet inline", async ({ page }) => {
    void page;
  });

  test.skip("source chip reflects real folder contents", async ({ page }) => {
    void page;
  });

  test.skip("disabling extension removes studio and context tabs", async ({ page }) => {
    void page;
  });
});
