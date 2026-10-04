# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`AGENTS.md` is a symlink to this file, so every coding agent (Codex included) reads the same instructions. Edit this file, never the link.

## Product Principles

**Read [docs/notes-feature/core/PRODUCT-PRINCIPLES.md](docs/notes-feature/core/PRODUCT-PRINCIPLES.md) before designing a feature.** It records what this product is *for*, so a design can be judged before it is built. The first principle in short: **make the user's existing file/folder structure the path of least resistance** — prefer projecting the structure a user already maintains over letting them build a parallel one, because the convenient route and the structurally sound route should be the same route. Workbenches (PR #177) are the worked example: folders are the only vocabulary, deliberately. The second: **unrefined → structured is the core loop** — notes accumulate repeated units, and the product's job is the path from a note's own blocks into linked database rows (and back), with gaps recorded as deliberate placeholders rather than silence.

## Repository Overview

**Next.js 16 application** — Digital Garden Content IDE, an Obsidian-inspired knowledge management system with panel-based layout, rich text editing, and multi-cloud storage.

**Archived apps** in `/archive` (not in build): `web-amino` (amino acid learning), `open-notes` (documentation).

## Development Commands

```bash
pnpm dev              # Start dev server (http://localhost:3015); predev auto-starts the Docker Postgres when LOCAL_POSTGRES=1
pnpm dev:collab       # Local Hocuspocus (ws://localhost:1234) — REQUIRED in dev, run from the same checkout as pnpm dev
pnpm build            # tsc + 26 validation gates + lint + 2 workspace smokes, then next build — see "Build pipeline" below
pnpm typecheck        # tsc --noEmit only (fast type check)
pnpm start            # Production server
pnpm lint             # ESLint with a --max-warnings ratchet (number lives in package.json; fails if count grows)
pnpm preflight        # Optional: CI gates locally + migration drift (needs SHADOW_DATABASE_URL) → PASS/FAIL summary
pnpm build:tokens     # Regenerate CSS variables from design tokens
pnpm db:local:up      # Start local Docker Postgres (db:local:down / db:local:reset to stop / wipe)
pnpm db:local:bootstrap  # First-time local DB: start container → migrate deploy → db push → seed (refuses to run against Neon)
pnpm db:target        # Print which DB the env points at; fails if LOCAL_POSTGRES disagrees with the DATABASE_URL host
pnpm db:seed          # Seed database with test ContentNode data
pnpm trace:view       # Render the latest dev-logger trace (.local/debug-payloads) to HTML; --list, <trace_id>, --open
pnpm collab:schema:check  # CI gate: validate collaboration schema covers all editor extensions
pnpm ai:drift:check   # CI gate: AI parallel-table drift (provider catalog ↔ connection templates ↔ type unions ↔ settings enum; tool inventory ↔ settings metadata; prompt tool references; adapter branches; run-loop schemas describe-only)
pnpm context:diet:check  # CI gate: the model-facing transcript folds (distillation/turn), dedupe, write-input supersession, header retention — fixture transcripts, mutation-tested
pnpm proposal:shape:check  # CI gate: the propose_item_iteration payloads that died in prod parse and resolve by meaning (lib/domain/ai/tools/iteration-proposal.ts — "schemas describe shape; execute judges")
pnpm reader:check     # Reader gate: OPDS 1/2 parsing, EPUB DRM detection + metadata, Kindle clippings — fixture-based, no network (scripts/validate-reader.ts)
pnpm private:content:check  # CI gate: private (commented-out) content — stripPrivateContent predicate + every AI/public/search seam calls it; the source-view serializer does not
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
npx prisma db push    # Push schema changes in dev (no migration file)
npx prisma studio     # Database GUI (http://localhost:5555)
```

**There is no unit-test runner (no Jest/Vitest).** Logic is pinned by standalone `tsx` scripts in `scripts/` — `validate-*.ts` gates wired as `pnpm <name>:check`, and `*-smoke.ts` harnesses wired as `pnpm <name>:smoke`. Run one with its `pnpm` script, or directly with `npx tsx scripts/<file>.ts`. When a `pnpm build` gate fails, rerun just that script to iterate. Run a single Playwright spec with `pnpm exec playwright test tests/e2e/dark-mode/home.spec.ts --project=dark` (add `-g "<test title>"` to filter).

**Worktrees live in `.claude/worktrees/<name>` — always.** Every git worktree for this repo is created inside the repo at `.claude/worktrees/<short-name>` (e.g. `git worktree add .claude/worktrees/reader <branch>`), never as a sibling directory (`../Digital-Garden-foo`) or anywhere else. When giving the owner worktree commands, use this path. Copy `.env.local` into the new worktree, and run `pnpm dev` and `pnpm dev:collab` from inside it (Hocuspocus loads that checkout's schema).

**Primary verification is still manual** — `pnpm build` must pass, then smoke-test in browser. The Playwright harness adds visual regression coverage but only for signed-out routes today (auth fixture pending).

**Build pipeline:** `prisma generate` → `pnpm build:tokens` (style-dictionary) → `tsc --noEmit` → ~26 `tsx` validation gates (collab schema, note-edit ops, markdown block safety, private content, block ids/handles, reference block, shortcut mirror, extensions registry, polling, conflict banner, dark contrast, the AI gates — charters, output targets, prompt cache, diagnostics, model routing, pricing, inspector, drift, context diet, proposal shape, run harness, capability matrix, data read — and the feedback form's template/label check) → `pnpm lint` → workspace smokes (`workspace:pane-placement:smoke`, `workspace:cold-load:smoke`) → `next build --turbopack`. The `build` script in `package.json` is the authoritative list; the chain stops at the first failure.

**Vercel build** skips the `tsc --noEmit` and `lint` steps (`vercel-build` script). Those gates are enforced locally and in CI; Vercel stays minimal for fast deploys. Migrations are run manually via `npx prisma migrate deploy`.

**Bundler is Turbopack** for both `build` and `vercel-build` (and dev). Switched off `next build --webpack` after the webpack production build began timing out on Vercel's 2-core/8 GB builder — the growing module graph sent V8's GC into a thrash spiral under the 5120 MB heap cap (45-min timeout, no error). Turbopack builds the same tree in ~40s at the same cap. Keep local `build` and `vercel-build` on the **same** bundler so local green faithfully predicts the deploy.

**Heap size for local `pnpm build`** — Node's default V8 heap (~4 GB) is no longer enough on this codebase; full builds can abort with `Abort trap: 6` during the type-emit or compilation phase. Local builds need `NODE_OPTIONS='--max-old-space-size=8192'`:

```bash
NODE_OPTIONS='--max-old-space-size=8192' pnpm build
```

CI runners (GitHub Actions, Vercel) have larger heaps by default and don't need this. Add it to your shell rc or build-script alias if you're on a machine with <16 GB RAM.

**CI gates** (`.github/workflows/`):
- **quality.yml** — runs `pnpm lint` (with the `--max-warnings` ratchet) and `pnpm typecheck` + `charters:check` + `output-targets:check` + `markdown:blocks:check` + `markdown:smoke` on every PR. Lint failures or warning count growth block merge.
- **migration-drift.yml** — on PRs touching `prisma/schema.prisma` or `prisma/migrations/**`: replays every migration into a Postgres 16 service DB and asserts it reproduces `schema.prisma`. A schema change without a migration fails here (see Database Workflows).
- **collaboration-hardening.yml** — runs `pnpm collab:schema:check` on collab-touching PRs. Scans all TipTap extension source files for `Node.create`/`Mark.create` and asserts every discovered node/mark is covered in `getCollaborationServerExtensions()`. Every new TipTap Node/Mark **must** export a `Server*` variant and be registered in `lib/domain/collaboration/extensions.ts`.
- **ai-drift.yml** — runs `pnpm ai:drift:check` on AI-touching PRs (`lib/domain/ai/**`, `lib/features/ai-connections/**`, the chat route, settings validation). Guards the AI subsystem's parallel tables: every direct-vendor template model must have a `PROVIDER_CATALOG` entry (the catalog is load-bearing — it supplies the per-model output ceiling and reasoning config), contextWindows must agree across files, type unions/settings enum must match the catalog, every tool must be classified user-configurable (settings metadata) or harness-internal, prompt/description tool references must resolve, and every `AdapterKind` needs a resolver branch. Full rationale: `docs/notes-feature/work-tracking/AI-DRIFT-GATES-PLAN.md`.
- **publishing-visual.yml** — runs on PRs touching the publishing surface (`extensions/publishing/`, `components/public/`, `app/(public)/`, `app/(test)/test/publishing-fixtures/`, `app/globals.css`, the publishing fixtures/spec/schema scripts). Two jobs: `schema` (typecheck + `publishing:schema:check` + `publishing:audit:defaults`) and `visual` (Playwright per-block snapshot suite against the synthetic fixture route). Visual job uploads diff PNGs as an artifact on failure. Hard-gate; failures block merge. Can be temporarily skipped via repo var `PUBLISHING_VISUAL_GATE=skip`.

## Visual Regression Testing (Playwright)

Full conventions: [tests/e2e/README.md](tests/e2e/README.md). The parts that bite:

- **Setup once:** `pnpm exec playwright install chromium`. Playwright expects `pnpm dev` already running on :3015; `PLAYWRIGHT_AUTOSTART=1` makes it start one (CI).
- **Every spec runs twice, in the `light` and `dark` projects.** Snapshot names get the project name as a suffix. They live in `tests/e2e/__snapshots__/` and are the visual contract. `pnpm test:e2e:update` rewrites **all** of them, so review the regenerated PNGs before committing.
- **Import `test`/`expect` from `tests/e2e/_fixtures/theme.ts`, never from `@playwright/test`, and navigate with `themedGoto`.** It seeds the theme in localStorage before the pre-hydration script (`lib/features/theme/script.ts`) runs. Wait for a stable element before snapshotting.
- **Live specs:** `dark-mode/`, `publishing/` and two in `editor/`. Everything else is a `test.skip` stub whose docstring gives its **Scope** and what it's **Blocked on**, mostly the missing auth fixture. The skipped count is remaining work, not failure.
- **Soft gate** by default (`playwright.config.ts`). The exception is `publishing-visual.yml`, which hard-gates the publishing block snapshots.
- **Don't add a screenshot test** for pure logic (typecheck or a `tsx` script is the gate), API contracts, or animation timing.

## Environment Setup

**Dev database = local Docker Postgres; Neon = production.** First-time setup per [docs/notes-feature/guides/database/LOCAL-POSTGRES.md](docs/notes-feature/guides/database/LOCAL-POSTGRES.md) (per-worktree DBs: `PER-WORKTREE-DATABASES.md` in the same folder):

```bash
# .env.local needs LOCAL_POSTGRES=1 and a localhost DATABASE_URL (template: .env.docker.example)
pnpm db:local:bootstrap   # container → migrate deploy → db push → seed
pnpm dev                  # terminal 1
pnpm dev:collab           # terminal 2 — set NEXT_PUBLIC_HOCUSPOCUS_URL=ws://localhost:1234
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

**Side panels belong in the right sidebar — never a panel inside a panel.** Any supporting view for the content in the main panel (details, notes/annotations, contents, display settings, inspectors) goes into the app's right sidebar, as a sidebar tab or a view within one (content-driven claims: `lib/extensions/content-sidebar.ts`; the reader's Book tab is the worked example). Don't build a second side panel inside a viewer. Accepted exceptions: the database row read view (may be reverted), and a book's table of contents beside the page in the reader (navigation wants the TOC next to the text; the same view is also in the sidebar rail, and hold/⌥-click on Contents opens it there). When the sidebar can't be seen (full screen), the same sidebar component may render as a drawer — reuse it, don't fork it.

**Generalizable tools go in the existing content toolbar; content-specific ones may use a secondary toolbar.** Anything that applies across content types (full screen — `state/content-fullscreen-store.ts`, speed read, export, share) belongs in `ContentToolbar`, never duplicated inside a viewer. A viewer may have a **secondary toolbar** under it, but only for affordances specific to that content that can't be generalized (the reader's header row: contents, title, status, details, notes, display, bookmark). Buttons that open supporting views are *shortcuts into the right sidebar* on the right view, not toggles of a private panel. Tools may also live in context when they genuinely fit there: actions on a selection (the reader's highlight/underline popover), BubbleMenu formatting, in-content navigation (page arrows). (Owner rules, 2026-09-30.)

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

**Active extensions:** `daily-notes`, `flashcards`, `people`, `workplaces` (workspaces — named tab sets + pane layouts), `calendar`, `publishing`, `speed-reader`, `browser-bookmarks`, `workflows`, `studio` (Folder Studio), `reader` (e-reader + book library — `docs/notes-feature/work-tracking/EREADER-PLAN.md`)

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
- `workspace-store.ts` / `workspace-tab-filter-store.ts` — Client side of workspaces; server rows, membership and `baseUpdatedAt` conflict checks live in `extensions/workplaces/server/`. Debug with the tracer **before** theorising: `localStorage.setItem("dg:trace:workspace", "1")` (`lib/core/workspace-trace.ts`). Placement/cold-load regressions are pinned by the `workspace:*:smoke` scripts in `build`.

### TipTap Editor

**Location:** `lib/domain/editor/`

**Four extension sets:**
- `getEditorExtensions()` — Client-side, includes React components (SlashCommands, WikiLink suggestion, Tag suggestion, PersonMention)
- `getServerExtensions()` — Server-safe for API routes and markdown conversion
- `getViewerExtensions()` — Read-only display (delegates to `getEditorExtensions()`)
- `getCollaborationServerExtensions()` — Used by Hocuspocus server and `collab:schema:check` CI; lives in `lib/domain/collaboration/extensions.ts`

**Custom extensions** (in `lib/domain/editor/extensions/`):
- `wiki-link.ts` — `[[Note Title]]` or `[[slug|Display]]`, autocomplete, click navigation. Optional **anchor** (`"<kind>:<id>"`) = where inside the target — generic contract in `lib/domain/content/link-anchor.ts`: owners register an anchor lister (`ExtensionRuntime.linkAnchors`) for the menu's `[[Title#` step (Tab drills in), and the target's viewer takes the anchor from `state/content-anchor-store.ts` on open. Kinds: `annotation` (reader highlights) and `verse` (scripture passages — `verse:alma/32/21-23`). A provider may also offer anchors straight from the typed text (`ExtensionRuntime.linkAnchorSuggestions` — `[[Alma 32:21`). Links may target an extension's virtual content (`reader:scripture/<corpus>`): clicks open that tab directly, and `collectWikiLinkRefs` skips non-UUID targets (never put them in a `@db.Uuid` query). Add kinds without a schema change. **Views:** a link displays as link / chip / card (`view` attr) or as a Note Window (the `noteWindow` block) — `lib/domain/editor/link-views.ts` converts both ways and every chooser (hover, window header, context menu "Display as") goes through it. Attrs come from ONE spec, `wiki-link-attrs.ts`, shared by the client and server nodes. Markdown: `[[Title|alias]]{#id .card}` / `![[Title]]{#id block=…}` via `lib/domain/content/wiki-link-markdown.ts` (plan: `docs/notes-feature/work-tracking/WIKILINK-VIEWS-PLAN.md`).
- `callout.ts` — Obsidian `> [!type] Title` syntax, 6 types (note, tip, warning, danger, info, success)
- `tag.ts` — Inline atomic node with `tagId`, `tagName`, `slug`, `color`. Renders as colored pill.
- `inline-timestamp.ts` — Clickable inline date/time with popover picker; `ServerInlineTimestamp` for server use
- `private-content.ts` — **Comment out prose**: `privateText` mark + `privateBlock` node, Cmd+/ toggle, `%%…%%` Obsidian syntax, `/private`. Content stays for the author and is stripped from every other reader by ONE predicate, `stripPrivateContent` (`lib/domain/content/private-content.ts`), called explicitly at each egress seam (search column, AI reads, mentions, charter bodies, public render, client outline). Never strip inside `tiptapToMarkdown` — the source view must show it. `pnpm private:content:check` pins the seam list. Guide: [docs/notes-feature/guides/editor/PRIVATE-CONTENT.md](docs/notes-feature/guides/editor/PRIVATE-CONTENT.md)
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

Handlers live under `app/api/<area>/`; `ls app/api` is the index. Content lives under `app/api/content/`: CRUD, tree, move, search, backlinks, tags, export, and the two-phase upload (`upload/initiate` returns a presigned URL, then `upload/finalize`). Its request/response types are in `lib/domain/content/api-types.ts`. AI routes are under `app/api/ai/`, with `chat/` as the main entry (see AI-ARCHITECTURE.md). Extension-owned areas (`workflows/`, `studio/`, …) are thin handlers that import from `extensions/<name>/server/`.

## Where Code Lives

- `app/`: Next.js routes. `(authenticated)/content/` is the IDE, `(public)/` the published site, `api/` the handlers.
- `components/content/`: IDE UI (editor, file tree, viewers, toolbar, sidebars, dialogs). `components/public/`: published-site rendering.
- `extensions/<name>/`: feature modules (see Extension System). `lib/extensions/` is the registry that loads them.
- `lib/domain/`: product logic by subject (content, editor, collaboration, ai, data, workspaces, reader, …).
- `lib/features/`: cross-cutting app features (settings, theme, AI connections, observability).
- `lib/infrastructure/`: auth, storage, crypto, rate limiting.
- `lib/core/`: small shared utilities (`cn()`, menu positioning, the workspace tracer).
- `lib/design/system/`: Liquid Glass tokens.
- `state/`: Zustand stores. `prisma/`: schema + migrations (owner-protected).
- `scripts/`: validation gates and smoke harnesses (the test suite), plus DB/trace tooling. `server/hocuspocus/`: the collaboration server (`pnpm dev:collab`; deployed to Cloud Run). `tests/e2e/`: Playwright.

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
- **`tsconfig.json` has `"strict": false`** — the strict posture is lint-enforced conventions, not the compiler. Practical consequence: without `strictNullChecks`, tsc does **not** narrow a union by a boolean discriminant (`if (!r.ok) r.code` → TS2339), so don't write `{ok:true…}|{ok:false…}` Result types; use a flat interface with optional fields + runtime guards (worked example: `DataDeckOutcome` in `lib/domain/flashcards/from-data.ts`). Incremental `pnpm typecheck` can also serve a stale green after branch switches — the build's `tsc` is authoritative.
- **No `any` types**. Use `unknown` and narrow, `Record<string, unknown>` for loose objects, or a proper type. If genuinely unfixable (untyped third-party lib, etc.) flag with `// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(...): <reason>`.
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
2. **`pnpm lint`** — uses the `--max-warnings` ratchet in `package.json`. **Zero new warnings, zero errors.** If you must introduce a warning, fix an equal-or-greater number elsewhere or update the ratchet number with justification.
3. **`pnpm build`** — full production build (runs both the above plus every validation gate and workspace smoke). Final gate before declaring complete. Locally needs `NODE_OPTIONS='--max-old-space-size=8192'`; pipe it through `set -o pipefail` if you `| tail` the output, or a red build reads as green.
4. **Browser smoke test** — for any UI change, manually exercise the feature in a browser. Type checks verify correctness; they don't verify behavior.

Rules for specific lint signals. Treat React Compiler errors as bug reports, not style complaints: the Apr 2026 lint-cleanup epic found real ones (a stale `useCallback` mention callback in ChatInput, a render-time ref write in DiagramsNetEditor that doubled under StrictMode).
- **`react-hooks/exhaustive-deps`** — the missing dep is almost always a real bug. Add it. If you genuinely can't (callback should be stable, dep would cause infinite loop), restructure with `useCallback`/`useRef` or add `// eslint-disable-next-line react-hooks/exhaustive-deps -- <why>`. Don't suppress silently.
- **`react-hooks/rules-of-hooks`** — never suppress. Hoist all hooks above early-return branches.
- **`react-hooks/immutability` (React Compiler)** — "cannot modify value": you're mutating something derived from a prop or hook argument. Fix patterns: (a) move the mutation into a `useEffect` and use a ref the component owns, (b) extract to a module-scope helper function (parameter rebinding breaks lineage analysis).
- **"Compilation Skipped" (React Compiler)** — the compiler found incorrect manual memoization (typically a `useCallback`/`useMemo` dep array that disagrees with what it would generate). Fix the dep array; don't suppress.
- **"Cannot access refs during render" / "Cannot call impure function during render"** — render must be pure. Move ref writes and `Date.now()`/`Math.random()`/etc. into effects. `useId()` is the pure alternative to `Date.now()` for unique IDs. A ``key: `${contentId}-${Date.now()}` `` once remounted OnlyOfficeEditor's iframe on every render.

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

Full guide (block inventory, per-step checklist, footguns, template, CI gates reference):
**[docs/notes-feature/guides/publishing/PUBLISHING-BLOCK-GUIDE.md](docs/notes-feature/guides/publishing/PUBLISHING-BLOCK-GUIDE.md)**

### Five required surfaces — every block must satisfy all of them

| # | What | Where |
|---|---|---|
| 1 | Block file: schema + `registerBlock()` + client extension + server extension | `extensions/publishing/blocks/<name>.ts` |
| 2 | Server-runtime registration | `extensions/publishing/server-runtime.ts` |
| 3 | CSS (light defaults + `.dark` companions for any extreme colors) | `app/globals.css` |
| 4 | Playwright fixture JSON + entry in `PUBLISHING_FIXTURE_BLOCKS` + committed PNGs | `tests/e2e/_fixtures/publishing/` |
| 5 | Post-merge Hocuspocus redeploy via Cloud Build | `cloudbuild.hocuspocus.yaml` |

### Key rules (expanded in the guide)

- **Always use `dataAttr("camelKey")`** in `addAttributes()` — hand-rolling attribute access has silently dropped attrs in production (see `hero-image.ts`).
- **`renderHTML` reads kebab keys**: `HTMLAttributes["data-cta-text"]`, not `HTMLAttributes["ctaText"]`.
- **No collab registration step needed**: publishing blocks flow into `getCollaborationServerExtensions()` automatically via `getExtensionServerEditorExtensions()` → `publishingExtensionServerRuntime`. Unlike editor-level TipTap extensions, no manual entry in `lib/domain/collaboration/extensions.ts` is required.
- **Hocuspocus must be redeployed after merge**: it's a separate Cloud Run service (Docker image snapshot). Vercel does not redeploy it. Without a redeploy, unknown block types are serialized as `unsupportedBlock` placeholders, corrupting collaborative documents.
- **Dark-mode CSS is hard**: every `.public-prose .block-*` rule using an extreme color needs a `.dark` companion. Eight blocks were invisible on light pages for this reason. Run `pnpm publishing:audit:themes`.

### Quality gate commands

```bash
pnpm publishing:schema:check   # Server* export in server-runtime (hard gate)
pnpm publishing:audit:defaults # Zod defaults vs renderHTML fallback drift (info)
pnpm publishing:audit:themes   # CSS extreme colors without dark companion (info)
pnpm typecheck && pnpm lint    # TypeScript + ESLint
pnpm build                     # Full production build
pnpm test:e2e                  # Per-block Playwright visual regression (hard gate)
```

## Sprint/Epoch Development Model

2-week sprints within 8-12 week strategic epochs.

**Status tracking:**
- `docs/notes-feature/STATUS.md` — Single source of truth (MUST update when completing work)
- `docs/notes-feature/work-tracking/CURRENT-SPRINT.md` — Detailed sprint tracking
- `docs/notes-feature/work-tracking/BACKLOG.md` — Prioritized backlog

**After completing work:** Update STATUS.md frontmatter `last_updated`, move work items (⚪→🟡→✅), add to "Recent Completions" at top. Update BACKLOG.md when backlogging incomplete sprint items.

### Bug-fixing PRs — the smoke marker

A PR that fixes GitHub issues declares them in its **Pre-merge checklist**, one line per bug, with the issue number inside the marker:

```markdown
- [ ] **Smoke #83:** copy a checklist inside a column block → only the checklist pastes
- [ ] **Smoke #85:** upload an image while viewing a folder → lands in that folder, not root
```

Ticking a line is a **per-bug verdict**: checked means smoke-verified, unchecked means deliberately not resolved. There is no third state.

The Friday `/pr-closeout` routine closes exactly the issues whose lines are ticked — citing the PR, its merge commit SHA and date, and the smoke line verbatim — and reports the rest as held back. It never infers a fix from a bare `#N` reference, because PR bodies cite sprint numbers and sibling PRs identically; the marker is what removes that ambiguity. Write a concrete action and its expected result, never "verify it works": a vague line makes a bug uncloseable.

`/bug-triage` emits these lines ready to paste in each bug's **Gates** section of the weekly plan doc, and `/bug-fix` copies the line verbatim into every PR it opens. The three commands form one loop: Thursday 8am plans, Thursday noon attempts the high-confidence subset, Friday 6pm closes what you smoke-tested and ticked.

## Documentation

**Start here:** `docs/notes-feature/00-START-HERE.md`

**Core architecture:** `docs/notes-feature/core/`

**Guides:** `docs/notes-feature/guides/` — `database/`, `editor/`, `ui/`, `storage/`, `collaboration/`, `export/`

**History:** `docs/notes-feature/work-tracking/history/`
