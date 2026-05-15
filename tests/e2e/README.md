# End-to-End Tests (Playwright)

End-to-end regression coverage for the Digital Garden app. Authored during the dark-mode epoch (Sprint C) to lock in the visual baseline and scaffold a place for broader regression coverage to grow.

## Status

| Layer | State | What runs |
|---|---|---|
| **`dark-mode/`** | ✅ Operational | Screenshot diffs across light + dark themes for signed-out routes (home, sign-in, sign-up, embed/blank) |
| **`auth/`** `editor/` `file-tree/` `content/` `search/` `extensions/` | ⚠️ Stubs (`test.skip`) | Placeholders documenting what should be covered; not executed |

The Playwright runner reports both passed and skipped tests on every run — `n passed, m skipped` is the signal of "how much we have left to fill in."

## Running locally

```bash
# Make sure the dev server is running (port 3015)
pnpm dev   # in another terminal

# Run all e2e tests
pnpm test:e2e

# Run only one project (light or dark)
pnpm test:e2e --project=light
pnpm test:e2e --project=dark

# Update screenshot baselines after intentional visual changes
pnpm test:e2e:update

# Run a specific spec
pnpm test:e2e tests/e2e/dark-mode/home.spec.ts

# Show HTML report
pnpm test:e2e:report
```

On a fresh clone, the first run captures the baseline screenshots into `tests/e2e/__snapshots__/`. Subsequent runs compare against those baselines and fail on visual diffs that exceed `maxDiffPixelRatio: 0.01` (~1% of pixels).

## Architecture

### Theme propagation

The `themedGoto` fixture in `_fixtures/theme.ts` writes `notes:settings` to localStorage before navigation, so the pre-hydration script in `lib/features/theme/script.ts` applies `.dark` on first paint. The test's `colorScheme` (set by the Playwright project) is a fallback if localStorage is blocked.

### Snapshot organization

Snapshots are organized by spec file:

```
tests/e2e/__snapshots__/
  dark-mode/
    home.spec.ts/
      home-light.png
      home-dark.png
    sign-in.spec.ts/
      sign-in-light.png
      sign-in-dark.png
    ...
```

The project name (`light` / `dark`) is appended automatically by the `snapshotPathTemplate` in `playwright.config.ts`.

### Stub convention

A stub file:

1. Has a top-level JSDoc explaining **scope** (what should be tested) and **blockers** (what's needed before it can be enabled).
2. Uses `test.skip("description", async ({ page }) => { void page; })` for each scenario.
3. Avoids any setup that depends on unmerged infrastructure.

Why `void page;`? It satisfies the linter without doing anything — the test body is intentionally empty.

To activate a stub:

1. Remove `.skip`.
2. Implement the test body.
3. Update the file's top-level docstring with new scope.
4. Run the test and commit the resulting snapshot (if visual).

## Authentication

Currently the operational tests cover only **signed-out** routes (no auth required). To enable authenticated route tests:

1. Create `tests/e2e/_fixtures/auth.ts` that signs in a seeded test user via `/api/auth/sign-in`, captures the session cookie, and exposes it as a Playwright `storageState`.
2. Add `storageState: "playwright/.auth/user.json"` to the dark-mode project's `use` block in `playwright.config.ts`.
3. Update `tests/e2e/dark-mode/authenticated-routes.spec.ts` to remove the `test.skip(...)` lines.

The authenticated-routes spec already documents which screens should be covered.

## CI integration

The harness is designed as a **soft gate** — diffs surface as failures in the CI run, but don't block merge by default. Adjust by setting `forbidOnly` or `retries` in `playwright.config.ts`.

For CI environments where the dev server isn't already running, set `PLAYWRIGHT_AUTOSTART=1` and Playwright will start `pnpm dev` itself.

## Maintenance

When a visual change is **intentional** (e.g., a dark-mode color tune, a layout shift):

```bash
pnpm test:e2e:update
```

Review the regenerated PNGs in the diff before committing — they ARE the visual contract going forward. Don't blindly commit; check that the change matches your intent.
