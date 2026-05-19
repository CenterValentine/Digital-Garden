/**
 * Playwright config — dark mode visual regression coverage.
 *
 * Two projects ("light" / "dark") run against the same routes. Each test
 * sets the theme preference via localStorage before navigation so the
 * pre-hydration FOUC script applies the correct .dark class on first paint.
 *
 * Status (Sprint C of the dark-mode epoch):
 *   - tests/e2e/dark-mode/  — operational, run in CI as a soft gate
 *   - tests/e2e/{auth,editor,file-tree,content,search,extensions}/
 *     — non-operational stubs (test.skip), placeholders for future sprints
 *
 * See tests/e2e/README.md for harness layout and conventions.
 */

import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

// Load .env.local the same way Next.js dev does, so a worktree-specific
// port/base-URL override stays consistent between dev server and tests.
loadEnv({ path: resolve(__dirname, ".env.local") });

const PORT = process.env.PORT ?? "3015";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",

  use: {
    baseURL,
    trace: "on-first-retry",
    // Stable viewport for screenshots — change here, regenerate everywhere.
    viewport: { width: 1280, height: 800 },
  },

  // Snapshot path template — keep screenshots colocated with the spec.
  snapshotPathTemplate: "{testDir}/__snapshots__/{testFilePath}/{arg}-{projectName}{ext}",

  expect: {
    toHaveScreenshot: {
      // Small per-pixel threshold tolerates anti-aliasing differences.
      maxDiffPixelRatio: 0.01,
      animations: "disabled",
    },
  },

  projects: [
    {
      name: "light",
      use: {
        ...devices["Desktop Chrome"],
        colorScheme: "light",
      },
    },
    {
      name: "dark",
      use: {
        ...devices["Desktop Chrome"],
        colorScheme: "dark",
      },
    },
  ],

  // Run against the local dev server. Don't auto-start it here — assume the
  // user already has `pnpm dev` running. If you want CI to spin it up, set
  // PLAYWRIGHT_AUTOSTART=1 and the webServer block below will activate.
  ...(process.env.PLAYWRIGHT_AUTOSTART
    ? {
        webServer: {
          command: "pnpm dev",
          url: baseURL,
          reuseExistingServer: true,
          timeout: 120_000,
        },
      }
    : {}),
});
