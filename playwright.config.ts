/**
 * Playwright config — dark mode + authenticated visual regression coverage.
 *
 * Four projects, two pairs:
 *   - `light` / `dark`           — signed-out routes (home, sign-in, sign-up)
 *   - `auth-light` / `auth-dark` — authenticated routes, depend on `setup`
 *
 * The `setup` project runs once, signs in as the seeded admin user, and
 * writes a storageState JSON that the auth projects load via `use`. See
 * tests/e2e/setup/auth.setup.ts and tests/e2e/setup/paths.ts.
 *
 * Each test sets its theme preference via localStorage before navigation
 * so the pre-hydration FOUC script applies the correct .dark class on
 * first paint. See tests/e2e/_fixtures/theme.ts.
 *
 * See tests/e2e/README.md for harness layout and conventions.
 */

import { defineConfig, devices } from "@playwright/test";

import {
  ADMIN_STORAGE_STATE,
  AUTH_REQUIRED_SPECS,
  SIGNED_OUT_IGNORE,
} from "./tests/e2e/setup/paths";

const PORT = process.env.PORT ?? "3015";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Modest local retries to soak up dev-server jitter under concurrent
  // workers; CI keeps its single retry since CI workers are also limited.
  retries: process.env.CI ? 1 : 1,
  // Local workers capped at 4 — the dev server's HMR + Suspense streams
  // saturate above that with 99+ tests in the suite, causing screenshot
  // stability windows to time out. CI stays at 2 (the previous setting).
  workers: process.env.CI ? 2 : 4,
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
    // Default 5s is too tight when the dev server is under load from
    // parallel workers — `toHaveScreenshot` retries until consecutive
    // captures match, and HMR / Suspense streams keep the page subtly
    // re-rendering longer than that. This raises the timeout for ALL
    // expect() calls; per-assertion overrides remain available.
    timeout: 15_000,
    toHaveScreenshot: {
      // Small per-pixel threshold tolerates anti-aliasing differences.
      maxDiffPixelRatio: 0.01,
      animations: "disabled",
    },
  },

  projects: [
    {
      name: "setup",
      testMatch: /setup\/auth\.setup\.ts$/,
    },
    {
      name: "light",
      testIgnore: SIGNED_OUT_IGNORE,
      use: {
        ...devices["Desktop Chrome"],
        colorScheme: "light",
      },
    },
    {
      name: "dark",
      testIgnore: SIGNED_OUT_IGNORE,
      use: {
        ...devices["Desktop Chrome"],
        colorScheme: "dark",
      },
    },
    {
      name: "auth-light",
      testMatch: AUTH_REQUIRED_SPECS,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        colorScheme: "light",
        storageState: ADMIN_STORAGE_STATE,
      },
    },
    {
      name: "auth-dark",
      testMatch: AUTH_REQUIRED_SPECS,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        colorScheme: "dark",
        storageState: ADMIN_STORAGE_STATE,
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
