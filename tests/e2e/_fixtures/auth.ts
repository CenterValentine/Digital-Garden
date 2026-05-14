/**
 * Auth fixture — for tests that require an authenticated session.
 *
 * Authentication itself is wired at the **project level**, not the fixture
 * level. The `setup` project in playwright.config.ts runs once before
 * `auth-light` / `auth-dark`, signs in as the seeded admin user, and
 * persists the storageState JSON. The auth projects load that storageState
 * in their `use` block, so every test that runs under those projects
 * starts already signed in.
 *
 * This file currently re-exports `_fixtures/theme.ts` because authenticated
 * tests still need `themedGoto` for theme-aware navigation, and there are
 * no auth-only fixture helpers yet. Importing from here (rather than
 * directly from theme) is the **convention** that signals "this spec
 * assumes auth," and gives us a single seam to add helpers like
 * `signOut()` or `withSeededNote()` later without touching every spec.
 *
 * Use:
 *   import { test, expect } from "../_fixtures/auth";
 *
 * Caveat: an `auth` spec running under the signed-out `light` / `dark`
 * project (i.e. you forgot to add its glob to AUTH_REQUIRED_SPECS in
 * `setup/paths.ts`) will have no session cookie and will fail or redirect.
 * If a test mysteriously gets bounced to /sign-in, that's the first thing
 * to check.
 */

export { test, expect } from "./theme";
