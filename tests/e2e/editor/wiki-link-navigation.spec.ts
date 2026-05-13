/**
 * STUB — wiki-link autocomplete and click-to-navigate.
 *
 * Scope:
 *   - Typing `[[` opens the wiki-link autocomplete with matching notes
 *   - Selecting an autocomplete result inserts a wikiLink node with the
 *     correct contentId
 *   - Clicking an existing wiki-link in read mode navigates to the target note
 *   - Wiki-links to non-existent slugs show an "unresolved" visual state
 */

import { test } from "@playwright/test";

test.describe("editor: wiki-link", () => {
  test.skip("autocomplete opens on [[", async ({ page }) => {
    void page;
  });

  test.skip("inserts wikiLink node with correct attrs on selection", async ({ page }) => {
    void page;
  });

  test.skip("clicking link navigates to target note", async ({ page }) => {
    void page;
  });

  test.skip("unresolved link shows visual state", async ({ page }) => {
    void page;
  });
});
