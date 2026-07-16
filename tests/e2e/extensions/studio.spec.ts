/**
 * STUB — Folder Studio extension (Phases 1-7 surfaces, all live).
 *
 * Scope:
 *   - Studio tab appears in the right sidebar for folders (and only folders)
 *   - Context tab appears for folders, notes, files, html, code, external
 *   - Three-shelf grid renders every registered tool from the registry
 *   - Tool tile expands an inline sheet; chat tools invoke into the folder
 *     conversation (sessionStorage hand-off), job tools start a run
 *   - Source picker: tri-state selection, size bars, budget meter,
 *     NO TEXT + GEN badges, optimistic debounced save
 *   - Context tab: generate → sections populate; directives autosave;
 *     Role & Strategy proposal accept/dismiss; staleness badge on edit
 *   - Runs panel: running → done transition, artifact deep-link, failure
 *     state with error text; run survives a reload mid-flight
 *   - Disabling the studio extension removes both tabs
 *   - Both tabs render correctly in light and dark themes
 *   - Width-fluid layout survives the <768px sheet presentation
 *
 * Blocked on: auth fixture (tests/e2e/_fixtures/auth.ts) — all studio
 * surfaces live behind authenticated routes; plus seeded folder content
 * for deterministic picker rows, and a mocked AI connection for
 * generation flows.
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
