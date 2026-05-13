/**
 * STUB — Flashcards review flow.
 *
 * Scope:
 *   - Opening Review modal starts at card 1 of N
 *   - Card flip animation toggles front/back face
 *   - Side-nav buttons advance to next/previous card
 *   - Marking a card "mastered" advances and updates SRS interval
 *   - Marking "review again" recycles the card to the end of the session
 *   - Closing the modal preserves progress (resumes at the same card)
 */

import { test } from "@playwright/test";

test.describe("extensions: flashcards review", () => {
  test.skip("opens review modal at card 1 of N", async ({ page }) => {
    void page;
  });

  test.skip("flip animation toggles front/back", async ({ page }) => {
    void page;
  });

  test.skip("marking mastered advances and updates SRS", async ({ page }) => {
    void page;
  });

  test.skip("recycle returns card to end of session", async ({ page }) => {
    void page;
  });
});
