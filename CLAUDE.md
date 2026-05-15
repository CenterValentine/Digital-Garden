# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

**Next.js 16 application** — Digital Garden Content IDE, an Obsidian-inspired knowledge management system with panel-based layout, rich text editing, and multi-cloud storage.

**Archived apps** in `/archive` (not in build): `web-amino` (amino acid learning), `open-notes` (documentation).

## Development Commands

```bash
pnpm dev              # Start dev server (http://localhost:3015)
pnpm build            # prisma generate → build:tokens → tsc → collab:schema:check → lint → next build
pnpm typecheck        # tsc --noEmit only (fast type check)
pnpm start            # Production server
pnpm lint             # ESLint with --max-warnings 175 ratchet (fails if count grows)
pnpm build:tokens     # Regenerate CSS variables from design tokens
pnpm db:seed          # Seed database with test ContentNode data
pnpm collab:schema:check  # CI gate: validate collaboration schema covers all editor extensions
pnpm test:e2e         # Playwright visual regression (assumes pnpm dev is running)
pnpm test:e2e:update  # Regenerate baseline screenshots
pnpm test:e2e:report  # Open last HTML run report
npx prisma generate   # Regenerate Prisma client (lib/database/generated/prisma)
npx prisma db push    # Push schema changes in dev (no migration file)
npx prisma studio     # Database GUI (http://localhost:5555)
```

**Primary verification is still manual** — `pnpm build` must pass, then smoke-test in browser. The Playwright harness adds visual regression coverage but only for signed-out routes today (auth fixture pending).

**Build pipeline:** `prisma generate` → `pnpm build:tokens` (style-dictionary) → `tsc --noEmit` → `pnpm collab:schema:check` → `pnpm lint` → `next build --webpack`.

**Vercel build** skips the `tsc --noEmit` and `lint` steps (`vercel-build` script). Those gates are enforced locally and in CI; Vercel stays minimal for fast deploys. Local dev uses Turbopack (no webpack flag). Migrations are run manually via `npx prisma migrate deploy`.

**CI gates** (`.github/workflows/`):
- **quality.yml** — runs `pnpm lint` (with the `--max-warnings 175` ratchet) and `pnpm typecheck` on every PR. Lint failures or warning count growth block merge.
- **collaboration-hardening.yml** — runs `pnpm collab:schema:check` on collab-touching PRs. Scans all TipTap extension source files for `Node.create`/`Mark.create` and asserts every discovered node/mark is covered in `getCollaborationServerExtensions()`. Every new TipTap Node/Mark **must** export a `Server*` variant and be registered in `lib/domain/collaboration/extensions.ts`.

## Visual Regression Testing (Playwright)

**Two layers in one harness** — operational dark-mode screenshot coverage running today, plus non-operational stubs scaffolding future regression categories. See [tests/e2e/README.md](tests/e2e/README.md) for the full conventions.

### One-time setup (per machine)

```bash
pnpm install                              # Playwright is in devDependencies
pnpm exec playwright install chromium     # Browser binary, ~92MB
```

### Daily workflow

```bash
pnpm dev                # in one terminal — Playwright assumes it's already running
pnpm test:e2e           # in another — runs all e2e tests against http://localhost:3015
```

A typical run reports `n passed, m skipped`. Skipped tests are intentional stubs (see Stub Convention below) and their reasons surface in the reporter — keep an eye on the skipped count as a "remaining work" signal.

### When you intentionally change visual output

```bash
pnpm test:e2e:update    # regenerates ALL snapshots
```

Review the regenerated PNGs in `tests/e2e/__snapshots__/` before committing — those PNGs ARE the visual contract going forward. Diffs against them in CI mean either a real regression or an undocumented intentional change.

### Project structure

```
tests/e2e/
├── _fixtures/theme.ts         # themedGoto: seeds notes:settings localStorage before nav
├── dark-mode/                 # OPERATIONAL — runs every CI invocation
│   ├── home.spec.ts
│   ├── sign-in.spec.ts
│   ├── sign-up.spec.ts
│   ├── embed-blank.spec.ts
│   └── authenticated-routes.spec.ts  # currently test.skip — needs auth fixture
├── auth/ editor/ file-tree/ content/ search/ extensions/
│   └── *.spec.ts              # STUBS — test.skip() with docstring describing scope
└── __snapshots__/             # committed baseline screenshots, per-spec per-project
```

Two Playwright projects run every spec: `light` and `dark`. Snapshots auto-suffix with the project name (e.g., `home-light.png`, `home-dark.png`).

### Theme propagation in tests

Tests **MUST** import from `_fixtures/theme.ts` (not `@playwright/test` directly) so theme preference is set before navigation:

```ts
import { test, expect } from "../_fixtures/theme";

test("my surface renders correctly in both themes", async ({ page, themedGoto }) => {
  await themedGoto("/my/route");
  await expect(page).toHaveScreenshot("my-surface.png");
});
```

`themedGoto` writes `notes:settings.state.ui.theme` to localStorage before navigation, so the pre-hydration FOUC script in [lib/features/theme/script.ts](lib/features/theme/script.ts) applies the correct `.dark` class on first paint.

### Stub convention (non-operational specs)

Stubs document *what should be tested* without yet implementing it. Each stub file:

1. Has a top-level JSDoc with **Scope** (what to cover) and **Blocked on** (what's needed to enable).
2. Uses `test.skip("description", async ({ page }) => { void page; })` per scenario — empty body with `void page;` to satisfy the linter.
3. Does NOT depend on unmerged infrastructure.

To activate a stub:

1. Remove `.skip` from `test.skip(...)`.
2. Implement the test body.
3. Update the file's top-level docstring with new scope.
4. Run the test; commit any new snapshot PNG.

### Adding a new operational test

1. Decide if the surface needs auth. **Without auth** → put it in `tests/e2e/dark-mode/`. **With auth** → it stays stubbed in `dark-mode/authenticated-routes.spec.ts` until the auth fixture lands.
2. Use the `themedGoto` fixture (not raw `page.goto`).
3. Wait for a stable element before snapshotting (avoids flake from font/hydration timing): `await expect(page.getByRole("...")).toBeVisible();`
4. Run `pnpm test:e2e:update` to capture baselines, then `pnpm test:e2e` to verify.
5. Commit both the spec and the generated PNG(s).

### Known gaps (followups in BACKLOG.md)

- **Auth fixture** for `tests/e2e/_fixtures/auth.ts` — should sign in a seeded test user and persist `storageState`. Unblocks 5 stubbed authenticated dark-mode tests.
- **Hocuspocus fixture** for collaboration tests (`tests/e2e/editor/collaboration.spec.ts`) — needs a local Hocuspocus server or mock provider.
- **Seeded fixture content** for tests that depend on specific note state.

### CI integration

`playwright.config.ts` is **soft-gate by default**: failures surface in the PR but don't block merge automatically. Set `forbidOnly` and adjust `retries` in config if you want strict gating. For CI environments where the dev server isn't already running, set `PLAYWRIGHT_AUTOSTART=1` and the `webServer` block activates.

### When NOT to add a Playwright test

- Pure type/logic changes — `pnpm typecheck` is the right gate.
- API contract changes — write a unit test against the route handler, not a screenshot test.
- Animation timing — Playwright disables animations by default; capture the end state, not the motion.

## Environment Setup

```bash
# Create .env.local with required vars
npx prisma generate           # Generate Prisma client
npx prisma migrate reset --force  # Dev only! Creates tables + seeds
pnpm dev
```

**Required:** `DATABASE_URL` (PostgreSQL), `STORAGE_ENCRYPTION_KEY` (32-byte hex)
**Optional:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, storage provider credentials (R2/S3/Vercel Blob)

## Architecture

### Core Data Model: ContentNode v2.0

Single `ContentNode` table as universal container. Each leaf node has exactly one typed payload relation; folders have no payload.

**Payloads:** `NotePayload` (TipTap JSON), `FilePayload` (binary + storage metadata), `HtmlPayload`, `CodePayload`, `ExternalPayload` (URL + Open Graph metadata)

**Key columns:** `parentId` (hierarchy), `displayOrder` (ordering), `deletedAt`/`deletedBy` (soft delete), `customIcon`/`iconColor`, `searchText` (full-text search)

**Schema:** `prisma/schema.prisma`

### UI Architecture: Server/Client Split

**Critical pattern:** Server components for instant visual feedback, client components for interactivity.

- **Server components:** Panel headers, borders, layout structure, skeleton states. Use inline SVG for icons (NOT `lucide-react`).
- **Client components:** File tree (`react-arborist`), resizable panels (`allotment`), state (`zustand`), drag-and-drop.

```tsx
// Server Component pattern
<div>
  <Header />  {/* Server: instant render */}
  <Suspense fallback={<Skeleton />}>
    <Content />  {/* Client: progressive hydration */}
  </Suspense>
</div>
```

### Panel Layout

Three-panel layout managed by `ResizablePanels.tsx` using Allotment:
- **Left sidebar:** File tree, search, tags (`LeftSidebar.tsx`)
- **Main panel:** Content editor/viewer with toolbar (`MainPanel.tsx` → `MainPanelContent.tsx`)
- **Right sidebar:** Backlinks, outline, tags tabs (`RightSidebar.tsx`)

Both sidebars follow the same pattern:
```
Sidebar Wrapper (Client) — manages shared state
  ├─ SidebarHeader (Client) ← receives props
  └─ SidebarContent (Client) ← receives props
```

### Extension System

First-party feature modules with clear ownership boundaries. Each extension lives in `extensions/<name>/` and is registered once in `lib/extensions/installed.ts`.

**Expected structure per extension:**
- `manifest.ts` — ID, label, nav items, `enabledByDefault`, `canDisable`, surfaces
- `client.tsx` — Client runtime: shell controls, dialogs, slash commands, editor blocks, content viewer matcher
- `server-runtime.ts` — Server-safe editor/runtime contributions
- `components/` — UI owned by the extension
- `server/` — Services, types, route handlers
- `state/` — Extension-local Zustand stores

**Active extensions:** `daily-notes`, `flashcards`, `people`, `workplaces`, `calendar`

**Key rules:**
- Disabled extensions disappear through registry filters — never add direct conditionals in shared UI
- Shell controls, dialogs, and settings don't mount when extension is disabled
- New logic belongs inside `extensions/<name>/`, not in shared components

**Client registry:** `lib/extensions/client-registry.tsx` — `useIsExtensionEnabled(id)`, `getExtensionClientEditorExtensions()`
**Server registry:** `lib/extensions/server-registry.ts` — `getExtensionServerEditorExtensions()`

### Tool Surfaces System

Declarative registry mapping tools to UI surfaces with content-type filtering.

**Location:** `lib/domain/tools/`

- `types.ts` — `ContentType`, `ToolSurface` ("toolbar" | "toolbelt" | "sidebar-tab"), `ToolDefinition`, `ToolInstance`
- `registry.ts` — Static `TOOL_REGISTRY` array + `queryTools({ surface, contentType })` filter
- `context.tsx` — `ToolSurfaceProvider` wraps MainPanelContent; `useRegisterToolHandler()` for child components

**Surfaces:**
- **toolbar** — ContentToolbar buttons (export, copy link). Rendered in `components/content/toolbar/ContentToolbar.tsx`.
- **toolbelt** — BubbleMenu formatting buttons. BubbleMenu reads from registry at module level (no hooks — prevents TipTap plugin lifecycle interference).
- **sidebar-tab** — Right sidebar tabs (backlinks, outline, tags, chat). Filtered by content type via Zustand store.

**Key constraint:** `useContext` only sees PARENT providers. The component rendering `ToolSurfaceProvider` passes handlers via a `handlers` prop, not `useRegisterToolHandler`.

**BubbleMenu fix:** All buttons must have `onMouseDown={e => e.preventDefault()}` to prevent browser focus theft from the ProseMirror editor.

### State Management (Zustand)

All stores in `state/`. Pattern: `create<T>()(persist((set, get) => ({...}), { name, version }))`.

**Key stores:**
- `panel-store.ts` — Panel widths, visibility, localStorage persistence (v3)
- `content-store.ts` — Selected content ID/type, multi-selection, URL + localStorage sync
- `tree-state-store.ts` — Expanded/collapsed nodes
- `context-menu-store.ts` — Right-click menu positioning + actions
- `editor-stats-store.ts` — Word/char count, reading time
- `outline-store.ts` — Heading hierarchy from TipTap JSON
- `search-store.ts` — Query, filters, results cache
- `settings-store.ts` — User preferences (includes periodic notes config)
- `navigation-history-store.ts` — Back/forward navigation
- `left-panel-view-store.ts` / `left-panel-collapse-store.ts` — Left sidebar view/collapse
- `right-panel-collapse-store.ts` — Right sidebar collapse state
- `ai-chat-store.ts` — AI chat panel state

### TipTap Editor

**Location:** `lib/domain/editor/`

**Four extension sets:**
- `getEditorExtensions()` — Client-side, includes React components (SlashCommands, WikiLink suggestion, Tag suggestion, PersonMention)
- `getServerExtensions()` — Server-safe for API routes and markdown conversion
- `getViewerExtensions()` — Read-only display (delegates to `getEditorExtensions()`)
- `getCollaborationServerExtensions()` — Used by Hocuspocus server and `collab:schema:check` CI; lives in `lib/domain/collaboration/extensions.ts`

**Custom extensions** (in `lib/domain/editor/extensions/`):
- `wiki-link.ts` — `[[Note Title]]` or `[[slug|Display]]`, autocomplete, click navigation
- `callout.ts` — Obsidian `> [!type] Title` syntax, 6 types (note, tip, warning, danger, info, success)
- `tag.ts` — Inline atomic node with `tagId`, `tagName`, `slug`, `color`. Renders as colored pill.
- `inline-timestamp.ts` — Clickable inline date/time with popover picker; `ServerInlineTimestamp` for server use
- `blocks/` — Custom block nodes (SectionHeader, CardPanel, Accordion, Tabs, Columns, DailySummary, WeeklySummary, ExcalidrawBlock, MermaidBlock, etc.)
- `commands/slash-commands.tsx` — `/` menu for quick insertion

**Server variants:** Every custom Node/Mark must have a `Server*` variant in the same file (e.g. `ServerExcalidrawBlock`). All three extension sets (`getServerExtensions`, `getCollaborationServerExtensions`, and client) must stay in sync — the CI check enforces this.

**Unsupported content safety net:** `lib/domain/editor/unsupported-content.ts` exports `sanitizeTipTapJsonWithExtensions()`. Any unknown node types are rewritten to `unsupportedBlock`/`unsupportedInline` placeholders instead of being silently dropped, preserving round-trip fidelity.

**Schema versioning:** `lib/domain/editor/schema-version.ts` — MUST update `TIPTAP_SCHEMA_VERSION` (semver) whenever the schema changes. MAJOR bump requires a migration in `lib/domain/export/migrations.ts`.

**Auto-save:** 2-second debounce with visual indicator (yellow → green).

### Collaboration Architecture

**Transport:** Hocuspocus server hosted on Google Cloud Run (not local). Do not check port 1234 or suggest `pnpm dev:collab` for production testing.

**Y.js document storage:** `CollaborationDocument` Prisma table stores binary `ydocState`. On load, the server bootstraps from TipTap JSON if no Y.js state exists. Presence (awareness) state is persisted to Postgres to handle Vercel serverless split.

**Client topology states** (from `lib/domain/collaboration/runtime.ts`):
- `CollaborationAvailabilityState`: `"canonical"` | `"localFallback"` | `"plainFallback"`
- `ConnectionState`: `"localOnly"` | `"promoting"` | `"connecting"` | `"connected"` | `"synced"` | `"disconnectedButDirty"` | `"coolingDown"`

**editorMode dep array:** TipTap `useEditor` recreates the editor when the `deps` array changes. The `editorMode` string must encode provider presence (`"collaboration"` vs `"collaboration-local"`) so the editor recreates when Hocuspocus transitions from null → non-null.

**Collaborative fields:** `CollaborativeFieldKind` = `"tiptapXml"` | `"text"` | `"map"` | `"array"` | `"viewOnly"`. Embedded diagrams (Excalidraw, Mermaid) use sub-maps keyed by `blockExcalidraw:{blockId}` / `blockMermaid:{blockId}`.

### Periodic Notes / Daily Notes

**Extension:** `extensions/daily-notes/` — user-toggleable, `enabledByDefault: true`

**API routes:** `app/api/periodic-notes/resolve/` (find or create today's note), `app/api/periodic-notes/summary/` (activity signal for the daily summary block)

**Domain logic:** `lib/domain/periodic-notes/` — `period.ts` (date math), `settings.ts` (user prefs), `types.ts`

**Editor blocks:** `DailySummary` and `WeeklySummary` in `lib/domain/editor/extensions/blocks/periodic-summary.ts` — render activity summaries inline in notes. `ServerDailySummary` / `ServerWeeklySummary` are the server-safe variants.

**Activity signal:** `getEffectiveContentUpdatedAt()` in the summary route resolves payload-specific `updatedAt` (note, file, visualization, etc.) for accurate "last edited" tracking.

### Export System

**Location:** `lib/domain/export/`

**Converters:** Markdown (with wiki-links, callouts, semantic HTML comments for tags), HTML (standalone with embedded CSS), JSON (lossless TipTap JSON), PlainText. PDF/DOCX are stubs.

**Metadata sidecars:** `.meta.json` files preserve tags (ID, color), wiki-link targets, callout structure. Generated on export but **no import consumer exists** — round-trip import loses semantic data.

**Markdown tag format:** `<!-- tag:tagId:colorValue -->#tagname<!-- /tag -->` — renders as raw HTML comments when reimported.

### Storage Architecture

Factory pattern in `lib/infrastructure/storage/`. Providers: Cloudflare R2 (primary), AWS S3, Vercel Blob. Two-phase upload: initiate (get presigned URL) → finalize (confirm completion).

### Authentication

Custom OAuth with Google Sign-In. `lib/infrastructure/auth/` (barrel export via `index.ts`). Role hierarchy: owner > admin > member > guest. Admin endpoints require `requireRole("owner")`.

### AI Integration

**Location:** `lib/domain/ai/`

AI SDK v6 integration with BYOK (Bring Your Own Key) support.

- `types.ts` — Chat types, model configuration
- `providers/` — Model provider factories (Anthropic, OpenAI) using `createAnthropic()` / `createOpenAI()`
- `middleware/` — `defaultSettingsMiddleware` for model defaults
- `tools/` — AI tool definitions: `metadata.ts` (client-safe, no Prisma), `registry.ts` (server-only, has Prisma)

**AI SDK v6 conventions:**
- `useChat()`: Use `transport: new DefaultChatTransport({ api, body })` — no `api`/`body` props directly
- `useChat()`: No `initialMessages` — use `messages` field. No `input`/`setInput`/`handleSubmit` — use `sendMessage({ text })`
- `tool()`: Uses `inputSchema` (not `parameters`), import `z` from `zod/v4`
- `maxTokens` → `maxOutputTokens` in V3 call options
- `ChatStatus`: `'ready' | 'submitted' | 'streaming' | 'error'`

**AI tools ≠ Tool Surfaces** — separate directories (`lib/domain/ai/tools/` vs `lib/domain/tools/`), separate registries.

## API Routes

All content endpoints under `app/api/content/`:

```
GET/POST         /content/content              # List/create
GET/PATCH/DELETE /content/content/[id]         # CRUD
GET              /content/content/tree         # Hierarchical tree
POST             /content/content/move         # Drag-and-drop reorder
POST             /content/content/create-document
POST             /content/content/duplicate
POST             /content/content/upload/initiate   # Presigned URL
POST             /content/content/upload/finalize
POST             /content/content/upload/simple
GET              /content/content/[id]/download
GET/PATCH        /content/folder/[id]/view     # Folder view settings
GET              /content/search
GET              /content/backlinks
GET/POST         /content/tags
GET              /content/tags/content/[id]
GET/POST         /content/storage
POST             /content/export/[id]
POST             /content/export/vault          # Bulk ZIP export
POST             /content/external/preview      # Open Graph metadata fetch
```

Other API areas: `app/api/admin/`, `app/api/auth/`, `app/api/google-drive/`, `app/api/onlyoffice/`, `app/api/visualization/`, `app/api/categories/`, `app/api/user/`, `app/api/periodic-notes/`, `app/api/calendar/`

**Type definitions:** `lib/domain/content/api-types.ts`

## Directory Structure

```
app/
├── (authenticated)/content/    # Content IDE routes
├── api/                        # API routes
└── globals.css                 # Global styles + generated design tokens

extensions/                     # First-party feature extensions
├── daily-notes/                # Periodic notes (manifest, client, components)
├── flashcards/
├── people/
├── workplaces/
└── calendar/

components/content/
├── ai/                         # AI chat panel components
├── editor/                     # TipTap editor + BubbleMenu
├── toolbar/                    # ContentToolbar, ToolDebugPanel
├── tool-belt/                  # Tool management providers
├── folder-views/               # List, Grid, Kanban view components
├── external/                   # External link viewer + dialog
├── file-tree/                  # Tree node rendering
├── headers/                    # Left/Right sidebar headers
├── context-menu/               # Right-click context menu
├── viewer/                     # File type viewers (image, PDF, code, etc.)
├── dialogs/                    # Modal dialogs
└── skeletons/                  # Loading skeletons

lib/
├── core/                       # utils.ts (cn()), deep-merge, menu-positioning, glass-utils
├── database/                   # client.ts (Prisma singleton), generated/prisma/
├── domain/
│   ├── admin/                  # Admin panel + audit logging
│   ├── content/                # ContentNode utilities, OG fetcher, external validation
│   ├── collaboration/          # Hocuspocus runtime, documents, extensions, content-safety
│   ├── editor/                 # TipTap extensions (extensions/, commands/), schema-version, unsupported-content
│   ├── export/                 # Converters, metadata sidecars, bulk export, migrations
│   ├── periodic-notes/         # Period math, settings, types (daily/weekly notes domain)
│   ├── search/                 # Search filters
│   ├── ai/                     # AI SDK v6 integration (providers, middleware, tools)
│   ├── tools/                  # Tool Surfaces registry + context provider
│   └── visualization/          # Excalidraw, Mermaid, diagrams.net collaboration
├── extensions/                 # Extension registry infrastructure (client-registry, server-registry, types)
├── infrastructure/
│   ├── auth/                   # OAuth, sessions, middleware (barrel: index.ts)
│   ├── crypto/                 # Encryption utilities
│   ├── media/                  # File processing
│   └── storage/                # Multi-cloud provider abstraction
├── features/
│   ├── navigation/             # Branch builder
│   ├── office/                 # Blank document generator
│   └── settings/               # User settings CRUD (barrel: index.ts)
└── design/
    ├── system/                 # Liquid Glass tokens (surfaces, intents, motion)
    └── integrations/           # Third-party UI utilities

state/                          # Zustand stores
prisma/                         # schema.prisma, migrations/, seed.ts
scripts/                        # validate-collaboration-schema.ts, check-hocuspocus-env.ts
```

## Design System: Liquid Glass

Tokens in `lib/design/system/`: `surfaces.ts` (Glass-0/1/2 blur levels), `intents.ts` (semantic colors), `motion.ts` (animations).

Generated via `pnpm build:tokens` (style-dictionary → CSS variables in `globals.css`).

```tsx
import { getSurfaceStyles } from "@/lib/design/system";
const glass0 = getSurfaceStyles("glass-0");
<div style={{ background: glass0.background, backdropFilter: glass0.backdropFilter }}>
```

## Key Patterns & Conventions

### Code Standards
- TypeScript strict mode, **no `any` types**. Use `unknown` and narrow, `Record<string, unknown>` for loose objects, or a proper type. If genuinely unfixable (untyped third-party lib, etc.) flag with `// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(...): <reason>`.
- Ignore directories with " 2" suffix (e.g., `content 2`, `editor 2`) — filesystem artifacts, not part of the build
- Inline SVG for server component icons; `lucide-react` OK in client components only
- Import from barrel exports: `lib/domain/editor`, `lib/infrastructure/auth`, `lib/features/settings`, `lib/domain/tools`
- Use `lib/design/system/` tokens for styling
- **Never import Prisma into `"use client"` components** — causes dns/fs/net/tls bundler errors. Client-safe AI tool metadata lives in `lib/domain/ai/tools/metadata.ts`; server-only registry in `lib/domain/ai/tools/registry.ts`
- For Prisma JSON writes, use `as unknown as Prisma.InputJsonValue` (the cast goes through `unknown` because Prisma's input type is intentionally narrow)
- For unused parameters/vars that must remain (kept-for-signature, caught errors), prefix with `_` — eslint is configured to ignore `_`-prefixed identifiers via `argsIgnorePattern`/`varsIgnorePattern`/`caughtErrorsIgnorePattern`. **Do NOT** add bare `// eslint-disable` for unused-vars; rename instead.

### Quality Gates — before declaring a task done

The workflow is `typecheck → lint → build`. Each gates the next:

1. **`pnpm typecheck`** — fast. Run continuously while editing. Must be clean before lint.
2. **`pnpm lint`** — uses `--max-warnings 175` ratchet. **Zero new warnings, zero errors.** If you must introduce a warning, fix an equal-or-greater number elsewhere or update the ratchet number with justification.
3. **`pnpm build`** — full production build (runs both the above plus `collab:schema:check`). Final gate before declaring complete.
4. **Browser smoke test** — for any UI change, manually exercise the feature in a browser. Type checks verify correctness; they don't verify behavior.

Rules for specific lint signals:
- **`react-hooks/exhaustive-deps`** — the missing dep is almost always a real bug. Add it. If you genuinely can't (callback should be stable, dep would cause infinite loop), restructure with `useCallback`/`useRef` or add `// eslint-disable-next-line react-hooks/exhaustive-deps -- <why>`. Don't suppress silently.
- **`react-hooks/rules-of-hooks`** — never suppress. Hoist all hooks above early-return branches.
- **`react-hooks/immutability` (React Compiler)** — "cannot modify value": you're mutating something derived from a prop or hook argument. Fix patterns: (a) move the mutation into a `useEffect` and use a ref the component owns, (b) extract to a module-scope helper function (parameter rebinding breaks lineage analysis).
- **"Compilation Skipped" (React Compiler)** — the compiler found incorrect manual memoization (typically a `useCallback`/`useMemo` dep array that disagrees with what it would generate). Fix the dep array; don't suppress.
- **"Cannot access refs during render" / "Cannot call impure function during render"** — render must be pure. Move ref writes and `Date.now()`/`Math.random()`/etc. into effects. `useId()` is the pure alternative to `Date.now()` for unique IDs.

### Lessons learned (recorded in the lint-cleanup epic, Apr 2026)

Bugs found by the React Compiler and the type cleanup that we'd otherwise have missed:
- **OnlyOfficeEditor iframe reload churn** — `key: \`${contentId}-${Date.now()}\`` regenerated every render. Replaced with `useId()` for stable-per-mount keys.
- **ChatInput stale mention callback** — `handleSelect`'s `useCallback` dep array was missing `onMentionInserted`, leaving the parent's tracking callback frozen at its first identity.
- **DiagramsNetEditor StrictMode hazard** — `xmlRef.current = xml` ran during render, doubling under StrictMode. Moved into `useEffect(() => { ref.current = x }, [x])`.

These were all caught by enforcing the React Compiler rules during lint. Treat compiler errors as bug reports, not stylistic complaints.

### Adding a New TipTap Extension

1. Create `lib/domain/editor/extensions/<name>.ts` with both `MyExtension` (client) and `ServerMyExtension` (server-safe, no React) exports
2. Add `MyExtension` to `getEditorExtensions()` in `extensions-client.ts`
3. Add `ServerMyExtension` to `getServerExtensions()` in `extensions-server.ts`
4. Add `ServerMyExtension` to `getCollaborationServerExtensions()` in `lib/domain/collaboration/extensions.ts`
5. Bump `TIPTAP_SCHEMA_VERSION` in `lib/domain/editor/schema-version.ts` (MINOR for new nodes, MAJOR for breaking changes)
6. Run `pnpm collab:schema:check` to confirm CI passes

### Adding a New Extension Module

1. Create `extensions/<name>/manifest.ts`, `client.tsx`, and (if needed) `server-runtime.ts`
2. Register in `lib/extensions/installed.ts`
3. Shell UI contributions go through runtime shell slots — do not import extension UI directly into shared components
4. Content viewer: if the extension owns rendering for a specific content type, declare the matcher in `client.tsx`

### Database Workflows

**Development:** Edit `prisma/schema.prisma` → `npx prisma db push` → `npx prisma generate`

**Production:** `npx prisma migrate dev --name name --create-only` → review SQL → `npx prisma migrate deploy`

**Rules:** Use `db push` for dev (fast, no data loss). Never `migrate reset` in prod. Always `generate` after schema changes. Use `migrate resolve` to fix drift.

**Checklist:** `docs/notes-feature/guides/database/DATABASE-CHANGE-CHECKLIST.md` (mandatory for all schema changes)

### Menu Positioning

Portal rendering + boundary detection in `lib/core/menu-positioning.ts`. Two-phase: render hidden to measure, then position. Auto-flips at viewport edges. Used by context menus, dropdowns, tooltips.

## Sprint/Epoch Development Model

2-week sprints within 8-12 week strategic epochs.

**Status tracking:**
- `docs/notes-feature/STATUS.md` — Single source of truth (MUST update when completing work)
- `docs/notes-feature/work-tracking/CURRENT-SPRINT.md` — Detailed sprint tracking
- `docs/notes-feature/work-tracking/BACKLOG.md` — Prioritized backlog

**After completing work:** Update STATUS.md frontmatter `last_updated`, move work items (⚪→🟡→✅), add to "Recent Completions" at top. Update BACKLOG.md when backlogging incomplete sprint items.

## Documentation

**Start here:** `docs/notes-feature/00-START-HERE.md`

**Core architecture:** `docs/notes-feature/core/`

**Guides:** `docs/notes-feature/guides/` — `database/`, `editor/`, `ui/`, `storage/`, `collaboration/`, `export/`

**History:** `docs/notes-feature/work-tracking/history/`
