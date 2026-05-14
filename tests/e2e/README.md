# End-to-End Tests (Playwright)

End-to-end regression coverage for the Digital Garden app. Authored during the dark-mode epoch (Sprint C) to lock in the visual baseline and scaffold a place for broader regression coverage to grow.

## Status

| Layer | State | What runs |
|---|---|---|
| **`setup/`** | ✅ Operational | Signs in as the seeded admin user, persists storageState. Runs once before authenticated projects |
| **`dark-mode/`** | ✅ Operational | Signed-out routes (home, sign-in, sign-up, embed/blank) + authenticated routes (content workspace, settings preferences) across light + dark themes |
| **`auth/`** | ✅ Partial | Sign-in form (valid / invalid creds) + session persistence (reload, sign-out cookie clear) |
| `editor/` `file-tree/` `content/` `search/` `extensions/` | ⚠️ Stubs (`test.skip`) | Placeholders documenting what should be covered; not executed |

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

Wired at the **project level**, not per-test, so authenticated specs start already signed in with zero per-test cost.

### How it works

```
[setup project]  → tests/e2e/setup/auth.setup.ts
                     POSTs /api/auth/sign-in as admin@example.com
                     Writes playwright/.auth/admin.json (storageState)
                          ↓
[auth-light]  ←─────────  loads storageState in `use` config
[auth-dark]   ←─────────  same storageState, different colorScheme
```

The `setup` project is declared as a `dependency` of `auth-light` and `auth-dark` in `playwright.config.ts`, so Playwright guarantees it runs first.

### Spec routing

Which project a spec runs under is controlled by `tests/e2e/setup/paths.ts`:

- **`AUTH_REQUIRED_SPECS`** — list of glob patterns that need auth. Used as `testMatch` on the auth projects and (combined with `**/setup/**`) as `testIgnore` on signed-out projects.
- Specs not in the list run under `light` / `dark` (signed-out, no cookie).

**To add a new authenticated spec:** create the file, then add its glob to `AUTH_REQUIRED_SPECS`.

### Importing in specs

```ts
// Authenticated specs:
import { test, expect } from "../_fixtures/auth";

// Signed-out specs:
import { test, expect } from "../_fixtures/theme";
```

Both fixtures expose the same `themedGoto` helper today; the `auth.ts` import is the **conventional marker** that signals "this spec assumes auth," and the seam for future auth-only helpers (e.g., `signOut()`, `withSeededNote()`).

### Overriding credentials

```bash
PLAYWRIGHT_ADMIN_EMAIL=test@... PLAYWRIGHT_ADMIN_PASSWORD=... pnpm test:e2e
```

Defaults to the seed in `prisma/seed.ts` (`admin@example.com` / `changeme123`).

### Known gaps

- **DB-access fixture** — would unlock `expired session redirects to /sign-in` and several other negative-path session tests that need to forge expired `Session.expiresAt` rows.
- **Content-seeding fixture** — would unlock the 3 still-stubbed authenticated dark-mode tests (note with content, embedded Excalidraw, embedded Mermaid).
- **OAuth mock** — would unlock the Google OAuth handoff test in `auth/sign-in-flow.spec.ts`.

## SPA navigation gotcha

`/content` (and all authenticated routes) hold persistent network connections — HMR in dev, collab WebSocket in prod. Playwright's default `waitUntil: "load"` waits for ALL resources to settle, which **never happens** for these pages, so navigation will time out at 30s.

**Always use `domcontentloaded` and a DOM anchor:**

```ts
await page.goto("/content", { waitUntil: "domcontentloaded" });
await expect(page.getByRole("button", { name: "Files" })).toBeVisible();
```

The `themedGoto` fixture already does this — only use raw `page.goto` if you need to skip the theme/localStorage setup.

## CI integration

The harness is designed as a **soft gate** — diffs surface as failures in the CI run, but don't block merge by default. Adjust by setting `forbidOnly` or `retries` in `playwright.config.ts`.

For CI environments where the dev server isn't already running, set `PLAYWRIGHT_AUTOSTART=1` and Playwright will start `pnpm dev` itself.

## Maintenance

When a visual change is **intentional** (e.g., a dark-mode color tune, a layout shift):

```bash
pnpm test:e2e:update
```

Review the regenerated PNGs in the diff before committing — they ARE the visual contract going forward. Don't blindly commit; check that the change matches your intent.
