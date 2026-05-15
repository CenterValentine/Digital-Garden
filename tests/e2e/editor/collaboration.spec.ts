/**
 * STUB — two-client collaboration via Hocuspocus.
 *
 * Scope:
 *   - Two browser contexts editing the same note see each other's changes
 *   - Presence cursors show with collaborator labels
 *   - Local edits made while disconnected reconcile correctly on reconnect
 *   - Schema mismatch between clients sanitizes unknown nodes to
 *     unsupportedBlock (the version-skew finding from the slash command
 *     debugging — production peer with older schema)
 *
 * Blocked on: Hocuspocus test fixture (local server or mock provider) and
 * an authenticated test context.
 */

import { test } from "@playwright/test";

test.describe("editor: collaboration", () => {
  test.skip("two clients see each other's edits", async ({ browser }) => {
    void browser;
  });

  test.skip("presence cursors render with collaborator labels", async ({ browser }) => {
    void browser;
  });

  test.skip("disconnected edits reconcile on reconnect", async ({ browser }) => {
    void browser;
  });

  test.skip("schema mismatch sanitizes to unsupportedBlock", async ({ browser }) => {
    void browser;
  });
});
