# End-to-End Tests (Playwright)

End-to-end regression coverage for the Digital Garden app. Authored during the dark-mode epoch (Sprint C) to lock in the visual baseline and scaffold a place for broader regression coverage to grow.

## Status

| Layer | State | What runs |
|---|---|---|
| **`setup/`** | ✅ Operational | Signs in as the seeded admin user, persists storageState. Runs once before authenticated projects |
| **`_fixtures/`** | ✅ Operational | `theme`, `auth`, `content` (seed helpers) and `db` (test-time Prisma client) |
| **`dark-mode/`** | ✅ Operational | Signed-out routes (home, sign-in, sign-up, embed/blank) + authenticated routes (content workspace, settings preferences, note with seeded content) across light + dark themes |
| **`auth/`** | ✅ Operational | Sign-in form (valid / invalid creds) + session persistence (reload, sign-out, expired-session redirect) |
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

- **Hocuspocus fixture** — the Excalidraw + Mermaid block stubs in `dark-mode/authenticated-routes.spec.ts` need a Y.js doc seeded for the embedded block's `blockExcalidraw:` / `blockMermaid:` sub-map. The block schema delegates source storage to collab state — there's no static-render path today.
- **OAuth mock** — would unlock the Google OAuth handoff test in `auth/sign-in-flow.spec.ts`.

## Content seed fixture

For tests that need known content state (specific notes, folders, payload shapes), import from `_fixtures/content.ts`:

```ts
import { test, expect } from "../_fixtures/content";

test("note renders with seeded content", async ({ page, themedGoto, seed }) => {
  const note = await seed.note({
    title: "My Test Note",
    markdown: "# Hello\n\nWorld.",
  });
  await themedGoto(`/content?content=${note.id}`);
  await expect(page.getByRole("heading", { name: "Hello" })).toBeVisible();
});
```

### Available helpers

- `seed.note({ title?, parentId?, tiptapJson? OR markdown? })` — creates a note
- `seed.folder({ title?, parentId? })` — creates a folder
- `seed.trackedIds()` — read-only view of all node IDs created this test

### Lifecycle

- **Create** via `POST /api/content/content` — exercises the real API path
- **Cleanup** via direct `prisma.contentNode.deleteMany` — **hard-delete**, not the API's soft-delete to TrashBin (otherwise trash would accumulate from every test run)

Cleanup runs automatically at end of test in reverse creation order so children delete before parents (the `Hierarchy` relation is `onDelete: NoAction`).

### DB access requirement

The content fixture and `db.ts` need `DATABASE_URL` in the test process's environment. The fixture reads `.env.local` and `.env` via `dotenv` — same files `pnpm dev` reads. If you're running tests in a fresh worktree, symlink or copy `.env.local` from your primary checkout:

```bash
ln -sf /path/to/primary/.env.local .env.local
```

### Mutating auth state in tests

Tests that mutate auth state (sign-out, backdating sessions, account deletion) **must operate on a freshly-created session**, not the shared `admin.json` storageState that other concurrent workers also use. The pattern:

```ts
// Sign in fresh — response Set-Cookie lands in this context's jar,
// replacing the storageState cookie. Mutate this fresh session's row,
// not the shared admin one.
await page.request.post("/api/auth/sign-in", {
  data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
});
```

**Important: use `page.request`, NOT the test-level `request` fixture.** Playwright's `request` fixture has its own isolated cookie jar that does NOT load the project's storageState — using it for auth-mutating requests will operate on the wrong cookie and break concurrent tests.

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
