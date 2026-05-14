/**
 * Shared paths and patterns for the Playwright auth setup.
 *
 * Imported by both `tests/e2e/setup/auth.setup.ts` (writer) and
 * `playwright.config.ts` (reader) so the storage location and
 * authenticated-spec patterns can't drift between them.
 *
 * Paths here are relative to the project root because Playwright
 * resolves config-level paths from where the runner is invoked.
 */

/** Storage state JSON written by the setup project and loaded by auth projects. */
export const ADMIN_STORAGE_STATE = "playwright/.auth/admin.json";

/**
 * Glob patterns for specs that require an authenticated session.
 *
 * Auth projects use this as their `testMatch`; signed-out projects use it
 * (combined with the setup directory) as `testIgnore`. Add new authenticated
 * spec files here as their stubs are activated.
 */
export const AUTH_REQUIRED_SPECS = [
  "**/dark-mode/authenticated-routes.spec.ts",
  "**/auth/session-persistence.spec.ts",
];

/** Patterns that should never run under signed-out (`light` / `dark`) projects. */
export const SIGNED_OUT_IGNORE = [
  "**/setup/**",
  ...AUTH_REQUIRED_SPECS,
];
