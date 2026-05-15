/**
 * STUB — two-phase file upload (initiate → finalize).
 *
 * Scope:
 *   - Manual upload mode shows confirmation dialog before sending
 *   - Automatic upload mode skips the dialog
 *   - Presigned URL is generated and the PUT to storage succeeds
 *   - Finalize confirms the upload and creates the FilePayload
 *   - Failed uploads roll back the placeholder content node
 */

import { test } from "@playwright/test";

test.describe("content: upload finalize", () => {
  test.skip("manual mode shows confirmation dialog", async ({ page }) => {
    void page;
  });

  test.skip("automatic mode skips confirmation", async ({ page }) => {
    void page;
  });

  test.skip("finalize creates FilePayload after successful upload", async ({ page }) => {
    void page;
  });

  test.skip("failed upload rolls back placeholder", async ({ page }) => {
    void page;
  });
});
