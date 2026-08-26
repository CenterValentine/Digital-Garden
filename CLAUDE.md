# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

**Next.js 16 application** — Digital Garden Content IDE, an Obsidian-inspired knowledge management system with panel-based layout, rich text editing, and multi-cloud storage.

**Also in this repo, outside the Next.js build:** `server/hocuspocus/` (collaboration server, `pnpm dev:collab`), `extensions/browser-bookmarks/browser-extension/` (MV3 Chrome extension, `pnpm extension:build`), and `mobile/` (thin Expo WebView shell with its own `package.json` — see `mobile/README.md`). `AGENTS.md` at the root is the Codex-facing mirror of this file.

## Development Commands

```bash
pnpm dev              # predev (auto-starts Docker Postgres when LOCAL_POSTGRES=1) → next dev on http://localhost:3015
pnpm dev:collab       # Local Hocuspocus on ws://localhost:1234 — REQUIRED for live collab in dev; run from the SAME checkout
pnpm build            # Full gate chain (see "Build pipeline" below) → next build --turbopack
pnpm typecheck        # tsc --noEmit only (fast type check)
pnpm start            # Production server
pnpm lint             # ESLint with a --max-warnings ratchet (currently 159 — the number lives in package.json; fails if count grows)
pnpm preflight        # Runs the CI gates locally (typecheck, lint, collab/extensions/publishing checks, migration drift if SHADOW_DATABASE_URL is set) and prints PASS/FAIL
pnpm build:tokens     # Regenerate CSS variables from design tokens
pnpm db:local:up      # docker compose up local Postgres (db:local:down / db:local:reset also exist)
pnpm db:target        # Confirm DATABASE_URL points at localhost, not Neon prod
pnpm db:seed          # Seed database with test ContentNode data
pnpm collab:schema:check  # CI gate: validate collaboration schema covers all editor extensions
pnpm extensions:check # Build gate: installed.ts ↔ manifests.ts stay in sync + manifest iconName resolves
pnpm markdown:blocks:check  # Build gate: lossless markdown block codecs re-parse deep-equal
pnpm reference-block:check  # Build gate: file-tree reference block — object-identity contract, ordering, edge tagging
pnpm blocks:catalog   # Regenerate docs/notes-feature/guides/editor/BLOCK-CATALOG.md from registerBlock() calls (blocks:catalog:check flags staleness; not wired into build/CI)
pnpm extension:build  # Bundle the Chrome extension (extension:dev = watch). Then reload at chrome://extensions
pnpm trace:list       # List recorded AI turn traces (trace:view renders one)
pnpm ai:drift:check   # CI gate: AI parallel-table drift (provider catalog ↔ connection templates ↔ type unions ↔ settings enum; tool inventory ↔ settings metadata; prompt tool references; adapter branches)
pnpm ai:matrix        # Regenerate docs/notes-feature/core/AI-CAPABILITY-MATRIX.md from the real provider/model tables
pnpm ai:matrix:check  # CI gate: the committed capability matrix matches the code (run ai:matrix after model/provider changes)
pnpm publishing:schema:check  # CI gate: validate every publishing block has Server* variant + correct registerBlock type
pnpm publishing:audit:defaults  # Static drift detector: Zod defaults vs renderHTML fallbacks across publishing blocks
pnpm publishing:audit:themes  # Static theme-coverage audit: flags `.public-prose .block-*` rules with extreme colors (white-ish / dark-ish) that lack a `.dark` companion. Triage required — theme-stable surfaces (pricing, testimonial, etc.) are intentional false positives.
pnpm ai:pricing:check # CI gate: every reachable model id has a price row or an explicit unpriced-allowlist entry + cost-calculator fixtures (lib/features/ai-connections/usage/pricing.ts)
pnpm showcase:figures # Sync README/docs figure slots with media in docs/media/figures/ + rewrite the FIGURES.md audit (see guides/showcase/SHOWCASE-MAINTENANCE.md; /update-showcase skill)
pnpm test:e2e         # Playwright visual regression (assumes pnpm dev is running)
pnpm test:e2e:update  # Regenerate baseline screenshots
pnpm test:e2e:report  # Open last HTML run report
npx prisma generate   # Regenerate Prisma client (lib/database/generated/prisma)
npx prisma db push    # Local throwaway spikes ONLY — anything committed needs a migration (see Database Workflows)
npx prisma studio     # Database GUI (http://localhost:5555)
```

**Running a single e2e test:** `pnpm test:e2e tests/e2e/dark-mode/home.spec.ts` (file), `pnpm test:e2e -g "renders"` (title filter), `--project=dark` to run one theme. There is **no unit-test runner** (no vitest/jest) — logic is verified by `tsc`, the `tsx scripts/validate-*.ts` static gates, and Playwright.

**Primary verification is still manual** — `pnpm build` must pass, then smoke-test in browser. The Playwright harness adds visual regression coverage but only for signed-out routes today (auth fixture pending).

**Build pipeline** (`package.json` `build`): `prisma generate` → `build:tokens` → `tsc --noEmit` → **static gates** (`collab:schema:check`, `note-edit:check`, `markdown:blocks:check`, `blockid:hygiene:check`, `reference-block:check`, `extensions:check`, `playbooks:check`, `output-targets:check`, `prompt-cache:check`, `ai:diagnostics:check`, `model-routing:check`, `ai:pricing:check`, `inspector:check`, `ai:drift:check`, `ai:matrix:check`) → `lint` → `next build --turbopack`. Every gate is a `tsx scripts/validate-*.ts` script; a new drift detector goes in `scripts/` and gets appended to this chain. If a gate fails, read its script header — most document the invariant they protect and the incident that motivated it.

**Vercel build** skips the `tsc --noEmit` and `lint` steps (`vercel-build` script). Those gates are enforced locally and in CI; Vercel stays minimal for fast deploys. Migrations are run manually via `npx prisma migrate deploy`.

**Bundler is Turbopack** for both `build` and `vercel-build` (and dev). Switched off `next build --webpack` after the webpack production build began timing out on Vercel's 2-core/8 GB builder — the growing module graph sent V8's GC into a thrash spiral under the 5120 MB heap cap (45-min timeout, no error). Turbopack builds the same tree in ~40s at the same cap. Keep local `build` and `vercel-build` on the **same** bundler so local green faithfully predicts the deploy.

**Heap size for local `pnpm build`** — Node's default V8 heap (~4 GB) is no longer enough on this codebase; full builds can abort with `Abort trap: 6` during the type-emit or compilation phase. Local builds need `NODE_OPTIONS='--max-old-space-size=8192'`:

```bash
NODE_OPTIONS='--max-old-space-size=8192' pnpm build
```

CI runners (GitHub Actions, Vercel) have larger heaps by default and don't need this. Add it to your shell rc or build-script alias if you're on a machine with <16 GB RAM.

**CI gates** (`.github/workflows/`):
- **quality.yml** — runs `pnpm lint` (with the `--max-warnings` ratchet) and `pnpm typecheck` on every PR. Lint failures or warning count growth block merge.
- **migration-drift.yml** — on PRs touching `prisma/`, spins up Postgres + a shadow DB and asserts `prisma migrate diff --from-migrations --to-schema` is empty, i.e. the migration history reproduces `schema.prisma`. A schema change without its migration file fails here (see Database Workflows).
- **collaboration-hardening.yml** — runs `pnpm collab:schema:check` on collab-touching PRs. Scans all TipTap extension source files for `Node.create`/`Mark.create` and asserts every discovered node/mark is covered in `getCollaborationServerExtensions()`. Every new TipTap Node/Mark **must** export a `Server*` variant and be registered in `lib/domain/collaboration/extensions.ts`.
- **ai-drift.yml** — runs `pnpm ai:drift:check` on AI-touching PRs (`lib/domain/ai/**`, `lib/features/ai-connections/**`, the chat route, settings validation). Guards the AI subsystem's parallel tables: every direct-vendor template model must have a `PROVIDER_CATALOG` entry (the catalog is load-bearing — it supplies the per-model output ceiling and reasoning config), contextWindows must agree across files, type unions/settings enum must match the catalog, every tool must be classified user-configurable (settings metadata) or harness-internal, prompt/description tool references must resolve, and every `AdapterKind` needs a resolver branch. Full rationale: `docs/notes-feature/work-tracking/AI-DRIFT-GATES-PLAN.md`.
- **publishing-visual.yml** — runs on PRs touching the publishing surface (`extensions/publishing/`, `components/public/`, `app/(public)/`, `app/(test)/test/publishing-fixtures/`, `app/globals.css`, the publishing fixtures/spec/schema scripts). Two jobs: `schema` (typecheck + `publishing:schema:check` + `publishing:audit:defaults`) and `visual` (Playwright per-block snapshot suite against the synthetic fixture route). Visual job uploads diff PNGs as an artifact on failure. Hard-gate; failures block merge. Can be temporarily skipped via repo var `PUBLISHING_VISUAL_GATE=skip`.

## Visual Regression Testing (Playwright)

Full conventions live in [tests/e2e/README.md](tests/e2e/README.md) (setup, running, snapshot layout, stub convention, auth fixture plan, when NOT to add a test). The rules an agent most often gets wrong:

- **One-time:** `pnpm exec playwright install chromium`. **Every run:** `pnpm dev` must already be up on 3015 — the harness does not start it (set `PLAYWRIGHT_AUTOSTART=1` to opt in).
- **Import `test`/`expect` from `tests/e2e/_fixtures/theme.ts`, never from `@playwright/test`**, and navigate with `themedGoto("/route")`. It seeds `notes:settings.state.ui.theme` in localStorage *before* navigation so the pre-hydration FOUC script ([lib/features/theme/script.ts](lib/features/theme/script.ts)) applies `.dark` on first paint. Two projects (`light`, `dark`) run every spec; snapshots auto-suffix `-light.png` / `-dark.png`.
- Wait for a stable element (`await expect(page.getByRole(...)).toBeVisible()`) before `toHaveScreenshot` — font/hydration timing otherwise flakes.
- `pnpm test:e2e:update` regenerates **all** baselines; review the PNG diff before committing — the PNGs are the visual contract. Commit spec + PNGs together.
- `dark-mode/` (signed-out routes) and `publishing/` (per-block fixture route, hard CI gate) are operational; every other directory is `test.skip` stubs. Authenticated surfaces stay stubbed until `_fixtures/auth.ts` exists. `n passed, m skipped` — the skipped count is the remaining-work signal, not a failure.
- Soft gate by default (`playwright.config.ts`); the publishing suite is the exception and blocks merge via `publishing-visual.yml`.

## Environment Setup

Local dev runs against **Docker Postgres** (`docker-compose.yml`, db `digital_garden_dev`), never Neon — a `.env.local` pointing at Neon is talking to production. Full walkthrough: `docs/notes-feature/guides/database/LOCAL-POSTGRES.md`; variable reference: `docs/DEPLOYMENT.md`.

```bash
cp .env.example .env.local        # template is committed; fill in secrets
pnpm db:local:up                  # start Postgres (LOCAL_POSTGRES=1 in .env.local lets `pnpm dev` auto-start it)
pnpm db:target                    # sanity check: DATABASE_URL → localhost
npx prisma generate
npx prisma migrate deploy         # apply the committed migration history (NOT `migrate reset` — see Database Workflows)
pnpm db:seed
pnpm dev                          # http://localhost:3015
pnpm dev:collab                   # second terminal, same checkout — live collaboration in dev
```

**Required:** `DATABASE_URL` (use host `localhost`, not `127.0.0.1` — Docker's binding breaks with explicit IP literals), `LOCAL_POSTGRES=1` (when local), `STORAGE_ENCRYPTION_KEY` (32-byte hex, encrypts stored storage-provider + AI credentials), `NEXTAUTH_SECRET`
**Collab in dev:** `NEXT_PUBLIC_HOCUSPOCUS_URL=ws://localhost:1234` + `COLLABORATION_TOKEN_SECRET`
**Optional:** `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, storage provider credentials (R2/S3/Vercel Blob), AI provider keys (BYOK is configured in-app; env keys are fallbacks), n8n/workflows, observability (`LOG_LEVEL`, `LOG_TRACE`, `LOG_RECORD` — traces land in `.local/debug-payloads/`, view with `pnpm trace:view`)

**Prisma 7:** config lives in `prisma.config.ts` (loads `.env.local` then `.env`; `SHADOW_DATABASE_URL` wires the shadow DB for `migrate dev`), the client uses the `@prisma/adapter-pg` driver adapter, and the generated client is at `lib/database/generated/prisma` (import from there, not `@prisma/client`). `postinstall` runs `prisma generate`.

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

**Active extensions** (source of truth: `lib/extensions/manifests.ts`): `daily-notes`, `flashcards`, `people`, `workplaces`, `calendar`, `publishing`, `speed-reader`, `browser-bookmarks`, `workflows` (n8n spoke), `studio` (Folder Studio — folders as agentic hubs)

**Key rules:**
- Disabled extensions disappear through registry filters — never add direct conditionals in shared UI
- Shell controls, dialogs, and settings don't mount when extension is disabled
- New logic belongs inside `extensions/<name>/`, not in shared components
- **Extensions are a heavyweight last resort** — before proposing a new one, exhaust templates from existing blocks, then new blocks. See [Before Adding an Extension Module](#before-adding-an-extension-module) for the gating ladder.

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

**Lossless markdown system** (source-view toggle + paste-as-markdown): `tiptap → markdown → tiptap` is guaranteed lossless by **per-block self-verification** — a block is emitted as pretty markdown / HTML only if it re-parses deep-equal, else it falls to a verbatim base64 `dg-block` fence. To make a custom block render as pretty markdown (e.g. callout → `> [!note]`), add a codec in `lib/domain/content/markdown-block-codecs.ts` (needs BOTH a `toMarkdown` and a parse-side `reTag`), and fix the extension's `renderHTML`↔`parseHTML` symmetry first if `generateJSON(generateHTML(node))` ≠ node. `pnpm markdown:blocks:check` is the CI gate. **Full guide + safe-extension recipe: [docs/notes-feature/guides/editor/LOSSLESS-MARKDOWN-SYSTEM.md](docs/notes-feature/guides/editor/LOSSLESS-MARKDOWN-SYSTEM.md)** — read before challenging a foundation here.

**Auto-save:** 2-second debounce with visual indicator (yellow → green).

### Collaboration Architecture

**Transport:** Hocuspocus runs on Google Cloud Run in **production**. **Local dev now REQUIRES a local Hocuspocus** (`pnpm dev:collab`, ws://localhost:1234) — the dev database moved to local Docker Postgres, and the hosted server authorizes documents against Neon, so it cannot see locally-created content (symptom: "Live collaboration authentication could not be completed" on every note). Run `pnpm dev:collab` **from the same checkout as the dev server** (it loads that directory's `.env.local` and TipTap schema), and set `NEXT_PUBLIC_HOCUSPOCUS_URL=ws://localhost:1234` — never `0.0.0.0` (a bind address; browsers can't connect to it).

**Deploying Hocuspocus:** `gcloud builds submit --config cloudbuild.hocuspocus.yaml .` ships **the current working directory**. With multiple worktrees at different commits, always deploy from a tree matching `origin/main` — verify with `git diff origin/main --quiet` (exit 0). Use that, not a commit count: a just-merged branch is always ≥1 commit "behind" by its own merge commit while being content-identical.

**One region only (us-west1).** `_REGION` is pinned in the cloudbuild config because the client's `NEXT_PUBLIC_HOCUSPOCUS_URL` targets `…-uw.a.run.app`. A second, identically-named service in us-central1 once absorbed every deploy while the live service went untouched for three months — verify the region a deploy targeted (`gcloud run services list`) before concluding a fix shipped.

**Verifying a Hocuspocus deploy:** probe `/readyz` **five times** — success means five JSON responses with `uptimeMs` climbing (one instance surviving). Empty responses or `uptimeMs` resetting to a few hundred means the process is dying per request. Probe only after rollout settles; during a rollout, old draining instances answer too and contaminate the result. Note `uptimeMs` from `/readyz` measures time since the last cold start (`min-instances=0`), **not** time since deploy — never infer staleness from it; use `gcloud builds list` instead.

**Y.js document storage:** `CollaborationDocument` Prisma table stores binary `ydocState`. On load, the server bootstraps from TipTap JSON if no Y.js state exists — **or if the payload is fresher than the collaborative copy** (`payloadIsNewerThanCollaborativeCopy` in `lib/domain/collaboration/documents.ts`: payload `updatedAt` past the store-hook mirror stamp `metadata.collaborationSnapshotAt`, or stamp missing; meaningful; not a strict shrink of the Y.Doc snapshot). This is the self-healing net for content that reaches `NotePayload` outside the collab path (offline/REST fallback, imports, scripts) — staleness has historically been more damaging than overwrites. **Never "fix" divergence by reseeding after a payload write** (rival Y.Doc identity → duplicated content on reconnect); write THROUGH the Y.Doc (`write-note-content.ts`) and let bootstrap reconcile. Full contract + repair playbook: `docs/notes-feature/core/CONTENT-LOAD-CASCADE.md §9.4`. Presence (awareness) state is persisted to Postgres to handle Vercel serverless split.

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

**Orientation docs (read these before changing AI behavior):**
- [docs/notes-feature/core/AI-ARCHITECTURE.md](docs/notes-feature/core/AI-ARCHITECTURE.md) — the request lifecycle (multi-request turns, resolution ladder, tool assembly, step budgets, resume predicate), the five parallel model tables and which code consumes each, and "changing things safely" checklists. Symbol-anchored; verified per branch.
- [docs/notes-feature/core/AI-CAPABILITY-MATRIX.md](docs/notes-feature/core/AI-CAPABILITY-MATRIX.md) — **generated** (`pnpm ai:matrix`, guarded by `ai:matrix:check`): what every provider/model actually gets (ceilings, reasoning, search/PDF/caching, adapter coverage). Never edit by hand.

**AI domain structure:**
- `types.ts` — Chat types, model configuration
- `providers/` — Model provider factories (Anthropic, OpenAI) using `createAnthropic()` / `createOpenAI()`
- `middleware/` — `defaultSettingsMiddleware` for model defaults
- `tools/` — AI tool definitions: `metadata.ts` (client-safe, no Prisma), `registry.ts` (server-only, has Prisma)
- `features/` — Multi-model routing: `FEATURE_REGISTRY`, `resolveFeatureRoute()`, `executeWithFallback()` for model fallback chains
- `speech/` — TTS (text-to-speech) generation and storage: `generate.ts`, `generate-and-store.ts`, `catalog.ts`
- `transcribe/` — STT (speech-to-text): `transcribe.ts`
- `image/` — AI image generation: `generate.ts`, `generate-via-gateway.ts`, `generate-and-store.ts`
- `use-conversation-engine.ts` — Shared hook for all AI chat surfaces
- `conversation-persistence.ts` — Persists chat history to Prisma (`Conversation`, `ConversationMessage`, `ConversationAssociation` tables)

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

Other API areas: `app/api/admin/`, `app/api/auth/`, `app/api/google-drive/`, `app/api/onlyoffice/`, `app/api/visualization/`, `app/api/categories/`, `app/api/user/`, `app/api/periodic-notes/`, `app/api/calendar/`, `app/api/conversations/` (persisted chat history), `app/api/flashcards/`, `app/api/publishing/`, `app/api/speed-reader/`, `app/api/media/`, `app/api/integrations/`, `app/api/trash/`, `app/api/logs/`, `app/api/cron/`

**AI-specific routes:** `app/api/ai/chat/`, `app/api/ai/speech/` (TTS), `app/api/ai/transcribe/` (STT), `app/api/ai/image/`, `app/api/ai/inject-media/`, `app/api/ai/follow-ups/`, `app/api/ai/folder-assist/`

**Type definitions:** `lib/domain/content/api-types.ts`

## Directory Structure

Not exhaustive — `ls` for the current tree. The entries below are the ones whose *purpose* isn't obvious from the name.

```
app/
├── (auth)/ (authenticated)/ (public)/ (test)/   # Route groups; (authenticated)/content = the IDE; (public) = published tenant sites; (test) = Playwright fixture routes
├── embed/                      # Browser-extension side-panel iframe surface (cookie path MUST stay /embed)
├── extension-overlay/          # Extension content-script overlay surface
├── mobile/                     # Expo WebView shell entry (see mobile/README.md)
├── u/ share/ shared/           # Public user pages + share links
├── api/                        # API routes (see API Routes above)
└── globals.css                 # Global styles + generated design tokens

extensions/                     # First-party feature extensions (manifest.ts + client.tsx + server-runtime.ts + components/ server/ state/)
├── daily-notes/                # Periodic notes
├── flashcards/                 # FSRS scheduling, Anki import
├── people/ workplaces/ calendar/
├── publishing/                 # Public site publishing (blocks/, server-runtime.ts — see Publishing Block Development Protocol)
├── speed-reader/               # RSVP speed reader (global-dialog surface)
├── browser-bookmarks/          # Chrome extension source (browser-extension/) + embed iframe integration + agentic co-browse (CDP)
├── workflows/                  # n8n spoke: runs, webhooks, callbacks
└── studio/                     # Folder Studio — folders as agentic hubs

server/hocuspocus/              # Collaboration server (bootstrap.ts → server.ts); deployed separately to Cloud Run
mobile/                         # Expo WebView shell — its own package.json/tsconfig, not part of the Next build
scripts/                        # validate-*.ts static gates, generate-* doc generators, db/worktree helpers, extension bundler, preflight.sh

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
├── core/                       # utils.ts (cn()), deep-merge, menu-positioning, glass-utils, logger/ (structured logger + trace spans), use-anchored-menu
├── database/                   # client.ts (Prisma singleton via pg adapter), generated/prisma/ (import Prisma types from HERE)
├── domain/                     # Business logic; each dir usually = index.ts barrel + service.ts + types.ts
│   ├── content/                # ContentNode utilities, OG fetcher, external validation, markdown codecs, api-types.ts
│   ├── collaboration/          # Hocuspocus runtime, documents, extensions, content-safety
│   ├── editor/                 # TipTap extensions (extensions/, commands/), schema-version, unsupported-content
│   ├── blocks/                 # Block registry plumbing shared by editor + publishing: dataAttr(), builder tree, AI authoring modes, blockId walk
│   ├── ai/                     # AI SDK v6 integration (providers, middleware, tools, features, turn-diagnostics)
│   ├── ai-context/             # Folder Context Capsule: context gate, refresh, spend, gen-lock
│   ├── tools/                  # Tool Surfaces registry + context provider (NOT AI tools)
│   ├── export/ import/         # Converters + metadata sidecars; markdown import with round-trip verify
│   ├── periodic-notes/         # Period math, settings, types (daily/weekly notes domain)
│   ├── tenancy/                # Multi-tenant host gate, current-tenant resolution, permissions, public render
│   ├── workspaces/             # Compat barrel: re-exports extensions/workplaces/server (the real workspace domain lives in the extension)
│   ├── connections/ messaging/ notifications/   # Social graph, DMs (event-log), notification kinds
│   ├── browser-extension/      # Co-browse, page bridge, embed message origins, capture policy
│   ├── page-layout/ templates/ snippets/ people/ flashcards/ calendar/ search/ admin/ visualization/
├── features/                   # Cross-cutting app features (thinner than domain; often service.ts + hooks/components)
│   ├── settings/               # User settings CRUD (barrel: index.ts)
│   ├── ai-connections/         # BYOK provider connections, templates, model fetch, usage/pricing.ts
│   ├── ai-feature-routes/ chat-contexts/ conversations/   # Multi-model routing prefs, sticky chat contexts, persisted chat + associations
│   ├── theme/                  # Theme provider + pre-hydration FOUC script.ts
│   ├── tts/                    # Read-aloud controller, synthesis, web-speech fallback
│   ├── observability/          # WebVitalsReporter, PageLifecycle
│   ├── dev-banner/             # Worktree identity banner (reads own git HEAD)
│   ├── navigation/ office/ trash/ content/ search-connections/ stores/
├── extensions/                 # Extension registry infrastructure (installed.ts, manifests.ts, client-registry, server-registry, icons, types)
├── infrastructure/
│   ├── auth/                   # OAuth, sessions, middleware (barrel: index.ts)
│   ├── crypto/ media/ storage/ # Encryption; file processing; multi-cloud provider abstraction
│   ├── rate-limiting/ vercel/  # Rate limiter; Vercel domains API (tenant custom domains)
├── mobile-bridge/              # WebView ↔ Expo shell message client
├── personal/                   # Publishing → Garden mapping layer for the owner's public garden site (species/chapters/CATS vocabulary over generic PublicPath/PublicItem)
└── design/
    ├── system/                 # Liquid Glass tokens (surfaces, intents, motion)
    └── integrations/           # Third-party UI utilities

state/                          # Zustand stores (~50; extension-local stores live in extensions/<name>/state/)
prisma/                         # schema.prisma, migrations/, seed.ts — human-owned; agents surface migration SQL, owner commits it
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
- **Next.js 16 middleware is `proxy.ts`, not `middleware.ts`** — this repo renames it per Next.js 16 conventions. The function export is named `proxy`. Do not create `middleware.ts`; the build will fail if both files coexist.
- **Prefer a reputable, maintained library/framework over a bespoke build.** Before writing a non-trivial subsystem (parsers, detectors, automation engines, schedulers, extraction, etc.), *check for an existing well-maintained option first* and prefer it; also prefer reusing an existing **web/platform standard** (e.g. the HTML `autocomplete` vocabulary for form-field classification) over hand-rolled heuristics. Build custom only when nothing fits, and record **why** (the specific gap) in a comment or the relevant `*-PLAN.md`. This isn't licence to add heavy deps casually — weigh bundle/maintenance cost, and note that "extensions/new layers are a heavyweight last resort" still applies — but "we reinvented X without checking whether X exists" is the anti-pattern to avoid.

### Before a PR that changes `schema.prisma` — have the migration ready

The only pre-PR concern beyond the normal gates is **migrations**: a PR that adds/changes a model in `schema.prisma` must ship the matching migration file, or the CI `drift` check fails. A PR with no schema changes has nothing to do here. Since `prisma/` is human-owned, the agent surfaces the ready migration (canonical SQL via `prisma migrate diff` + exact create-and-commit steps) when prepping such a PR. `pnpm preflight` (optional) runs the CI gates locally — including the drift check when `SHADOW_DATABASE_URL` points at a local shadow DB — and prints a PASS/FAIL summary; use it before a PR when you want the confirmation, not as a required step.

### Quality Gates — before declaring a task done

The workflow is `typecheck → lint → build`. Each gates the next:

1. **`pnpm typecheck`** — fast. Run continuously while editing. Must be clean before lint.
2. **`pnpm lint`** — uses a `--max-warnings N` ratchet (N is in `package.json`, currently 159; it only goes down). **Zero new warnings, zero errors.** If you must introduce a warning, fix an equal-or-greater number elsewhere or update the ratchet number with justification. When you *remove* warnings, lower N in the same PR so the win is locked in.
3. **`pnpm build`** — full production build (runs both the above plus every static gate in the chain — see "Build pipeline"). Final gate before declaring complete. `pnpm preflight` is the cheaper CI-mirror when you only need the gates, not the bundle.
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

### Before Adding an Extension Module

Extensions are expensive: a new manifest, client runtime, optional server runtime, components directory, state store, registry entry, and a new piece of cognitive surface every future contributor must learn. Before proposing one, work through these gates **in order** and stop at the cheapest one that fits:

1. **Templates from existing blocks.** Can this feature be authored as a TipTap document composed of existing editor + publishing blocks (hero, columns, cards, callouts, accordions, tabs, etc.)? If yes, the "template" is just a documented composition pattern — no new code, no new schema, no new layer. Use Phase 2's item-as-home for paths (`PublicPath.homeItemId`) to land such templates as path roots.

2. **A new block.** If existing blocks can't express the feature, ask whether **one new block** (registered in the publishing block registry with a `Server*` variant) closes the gap. New blocks inherit the editor pipeline, schema-versioning, collaboration sync, and rendering paths that already work — adding capability without adding a layer.

3. **A new extension.** Only justified when the feature requires at least one of:
   - **First-class typed data** that doesn't reduce to block composition (e.g., `flashcards` FSRS scheduling state, `periodic-notes` period math, the deferred `resume` extension's Position/Education/Skill entities)
   - **Multiple shell-UI surfaces** (nav items + sidebar tabs + content viewers + dialogs) that need coordinated registration
   - **Runtime contributions** that don't fit block-level granularity (slash commands, suggestion menus, background jobs, server-side cron handlers)

**Worked example — Projects.** Project pages might initially feel like "they need an extension" because they have hero images, role/stack/dates, and a status. But all of that composes from existing blocks: a hero block for the cover, a callout for the role/stack/dates summary, a divider, then prose. The "Projects" path then uses item-as-home with a curated index. Result: a templated content pattern, zero new code, fully editable in the IDE. The instinct to extension-ize was wrong; the right answer was composition.

**Worked counter-example — Resume.** Genuinely structured: Position has a date range, employer, role, achievements list; Education has institution, degree, dates; Skills are a controlled vocabulary. None of those reduce to "TipTap content blocks." Plus PDF rendering and import/export workflows. An extension is the right call.

**Default bias: toward templates and blocks.** Prototype the template-version first. Promote to extension only after you've tried the cheaper path and found it genuinely insufficient — and document what specifically blocked the cheaper path so the next person doesn't re-litigate.

### Adding a New Extension Module (not exhaustive yet, do your own evaluation of scope and update this checklist as needed)

1. Create `extensions/<name>/manifest.ts`, `client.tsx`, and (if needed) `server-runtime.ts`
2. Register in **both** extension lists — they are intentionally separate (installed.ts bundles client runtimes so it can't be imported from Server Components; manifests.ts is server-safe data). The **`pnpm extensions:check` gate** (in `build`) enforces they stay in sync, so a miss fails the build with a clear message rather than shipping silently:
   - `lib/extensions/installed.ts` → `BUILT_IN_EXTENSIONS` (runtime: panels, content viewers, slash commands, `settingsDialog`).
   - `lib/extensions/manifests.ts` → `ALL_EXTENSION_MANIFESTS` (server-safe manifest; drives `EXTENSION_IDS`, which the `/settings/extensions/[id]` route uses to validate ids). **Miss this and the extension's settings page 404s to the public site** even though its runtime works fine — the sidebar entry renders (it reads the runtime registry) but the route calls `notFound()`. (Bit the workflows extension, PR #103 → fixed 2026-07-14; the gate exists so it can't recur.) The gate also asserts each manifest's `iconName` resolves in `lib/extensions/icons.tsx` (an unmapped name silently renders the Puzzle fallback).
3. Shell UI contributions go through runtime shell slots — do not import extension UI directly into shared components
4. Content viewer: if the extension owns rendering for a specific content type, declare the matcher in `client.tsx`
5. Settings body (optional): register a `settingsDialog` component in the runtime (`client.tsx`) to fill `/settings/extensions/<id>` and the Extensions dialog — one component, two mounts. Render `SettingSection` cards only; the shell provides the `SettingsPage` frame (title/toggle).

### Database Workflows

**Migration-first.** Every schema change that ships gets a migration file, so the migration history and `schema.prisma` stay in lockstep and any environment can be built from migrations alone. The history was consolidated to a clean baseline in 2026-07 (`docs/notes-feature/guides/database/MIGRATION-BASELINE-SQUASH.md`); the `migration-drift` CI gate keeps it that way.

**Making a schema change:**
1. Edit `prisma/schema.prisma`.
2. Generate + apply the migration against local Docker Postgres — `migrate dev` needs a shadow DB, wired via `datasource.shadowDatabaseUrl` in `prisma.config.ts`:

   ```bash
   SHADOW_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/shadow \
     npx prisma migrate dev --name <change>
   ```

   (Create the `shadow` database once: `docker exec digital-garden-postgres psql -U postgres -c 'CREATE DATABASE shadow;'`)
3. Review the generated SQL, then commit `schema.prisma` **and** the new `prisma/migrations/<...>/` together in the same PR.
4. `npx prisma generate` if the client didn't regenerate.

**Production:** `npx prisma migrate deploy` is the ONLY way prod schema changes. No raw SQL, no `db push` against prod.

**`db push`:** local throwaway spikes only. Anything you commit must first be captured as a migration (`migrate dev`) — a schema change without a matching migration fails the `migration-drift` CI gate (`.github/workflows/migration-drift.yml`), which replays the history into a shadow DB and asserts it reproduces `schema.prisma`.

**Rules:** Never `migrate reset` in prod. Always `generate` after schema changes. Use `migrate resolve --applied <name>` to baseline a database that already has the tables (bookkeeping only — no DDL, no data touched).

**Checklist:** `docs/notes-feature/guides/database/DATABASE-CHANGE-CHECKLIST.md` (mandatory for all schema changes)

### Menu Positioning

Portal rendering + boundary detection in `lib/core/menu-positioning.ts`. Two-phase: render hidden to measure, then position. Auto-flips at viewport edges. Used by context menus, dropdowns, tooltips.

## Publishing Block Development Protocol

**Read [docs/notes-feature/guides/publishing/PUBLISHING-BLOCK-GUIDE.md](docs/notes-feature/guides/publishing/PUBLISHING-BLOCK-GUIDE.md) before touching `extensions/publishing/blocks/`** — it has the block inventory, the six-step checklist, the file template, and the footguns with their incident history. The shape, so you know what "done" means:

**Five required surfaces per block:** (1) block file with schema + `registerBlock()` + client + `Server*` extension in `extensions/publishing/blocks/<name>.ts`; (2) `Server*` registered in `extensions/publishing/server-runtime.ts` — this *is* the collab registration, no manual entry in `lib/domain/collaboration/extensions.ts`; (3) CSS in `app/globals.css` with `.dark` companions for any extreme color (`pnpm publishing:audit:themes`); (4) Playwright fixture JSON + `PUBLISHING_FIXTURE_BLOCKS` entry + committed PNGs in `tests/e2e/_fixtures/publishing/`; (5) **post-merge Hocuspocus redeploy** (`cloudbuild.hocuspocus.yaml`) — Vercel does not do it, and an un-redeployed Hocuspocus rewrites the new block as `unsupportedBlock` in every collaborative doc.

**Footguns that have bitten production:** always `dataAttr("camelKey")` in `addAttributes()`; `renderHTML` receives kebab keys (`HTMLAttributes["data-cta-text"]`); dark-mode-first CSS made eight blocks invisible on light pages. Gates: `publishing:schema:check` (hard), `publishing:audit:defaults` / `publishing:audit:themes` (triage), and the `publishing/` Playwright suite (hard, `publishing-visual.yml`).

## Sprint/Epoch Development Model

2-week sprints within 8-12 week strategic epochs.

**Status tracking:**
- `docs/notes-feature/STATUS.md` — Single source of truth (MUST update when completing work)
- `docs/notes-feature/work-tracking/CURRENT-SPRINT.md` — Detailed sprint tracking
- `docs/notes-feature/work-tracking/BACKLOG.md` — Prioritized backlog

**After completing work:** Update STATUS.md frontmatter `last_updated`, move work items (⚪→🟡→✅), add to "Recent Completions" at top. Update BACKLOG.md when backlogging incomplete sprint items.

### Pull request conventions

**Body format — numbered sprints, then one checklist.** Every PR body is organized as sprint sections grouped by *theme* (security, editor, AI, polish…), never by commit order — even when the work was ad-hoc. Sprint numbers **continue from `current_sprint` in `docs/notes-feature/STATUS.md` frontmatter**; do not restart at 1. Reference example: PR #97 (Sprints 51–58).

```markdown
## Sprint N — Theme Name

One sentence on what this sprint accomplishes.

- specific change
- specific change

**Gate:** typecheck · lint · <relevant static gate> · manual smoke: <what you clicked>

## Sprint N+1 — …

## Pre-merge checklist
- [ ] `pnpm typecheck` / `pnpm lint` / `pnpm build` green
- [ ] <one line per concrete smoke-test action — "Attach a playbook via /playbook, confirm token meter shows only the active phase">
- [ ] <migration applied / Hocuspocus redeployed / etc. when applicable>
- [ ] Post-merge: <anything the owner must do after merge>
```

- **The checklist is self-contained.** Every manual smoke step goes in as its own `- [ ]` line. Never write "see conversation" / "see chat" — a reviewer without the transcript must be able to run it. Group by area (Gates, Database, per-feature smoke, Post-merge). End with the Claude Code attribution line.
- **Schema-bearing PRs** hand the owner a reviewable migration script (see "Before a PR that changes `schema.prisma`"), and after merge, the `npx prisma migrate deploy` step for prod (direct/non-pooling URL). Additive migrations deploy *ahead* of the code.
- **No standalone docs-only PRs.** Small doc additions/fixes ride on the next feature or chore PR (or wait on a held branch). Substantial new architecture docs are a judgment call.
- **Check PR state before pushing follow-ups**: `gh pr view <n> --json state,mergedAt`. The owner merges mid-session without announcing it; a push after merge strands the commit and a body edit after merge falsifies the record. If merged → sync with main, open a new PR.
- Fenced command blocks in PR bodies (and chat) contain **only runnable lines** — no `#` comments interleaved; put explanation above the fence.

## Documentation

**Start here:** `docs/notes-feature/00-START-HERE.md`

**Core architecture:** `docs/notes-feature/core/`

**Guides:** `docs/notes-feature/guides/` — `database/`, `editor/`, `ui/`, `storage/`, `collaboration/`, `export/`

**History:** `docs/notes-feature/work-tracking/history/`
