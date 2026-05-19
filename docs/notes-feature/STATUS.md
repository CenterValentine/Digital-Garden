---
last_updated: 2026-05-18
current_epoch: 13
current_sprint: 58
sprint_status: planned
---

# Digital Garden Content IDE - Status

**Single source of truth for current development status**

<!--
MAINTENANCE INSTRUCTIONS (for AI assistants & developers):

ALWAYS UPDATE when:
- Completing a work item -> Move to "Recent Completions"
- Starting work -> Change Planned to In Progress
- Significant progress -> Update percentages
- Encountering blockers -> Add to "Active Blockers"

WHAT TO UPDATE:
1. Frontmatter: Change `last_updated` to current date (YYYY-MM-DD)
2. Work Items: Update status emoji
3. Recent Completions: Add new entry at TOP (keep last 30 days)
4. Progress: Recalculate (Completed Points / Total Points) * 100
5. Known Issues: Add/remove/update blockers

SYNC WITH: work-tracking/CURRENT-SPRINT.md (detailed tracking)
FULL GUIDE: STATUS-MAINTENANCE-GUIDE.md

SPRINT EXECUTION PROTOCOL:
Before commencing any sprint, always ask the user for input on the sprint plan
before planning and executing. There may be additions or modifications.
-->

## Current Work

### Active Epoch: Epoch 13 - People + Collaboration
**Duration**: 6 sprints (58-63)
**Theme**: People/domain tree mirroring, person mentions, safe sharing, and Hocuspocus-backed collaboration

**Sprint Plan**:
- Sprint 58: Foundations (planned)
- Sprint 59: People View + Mount UX (planned)
- Sprint 60: Tree Policy Hardening (planned)
- Sprint 61: Person Mentions (planned)
- Sprint 62: Hocuspocus Collaboration (planned)
- Sprint 63: Share + Media Prototype (planned)

**Worktree**: `/Users/davidvalentine/Documents/Digital-Garden/.worktrees/epoch-13-people-collab`
**Branch**: `codex/epoch-13-people-collab`
**Detailed Plan**: `docs/notes-feature/work-tracking/epochs/epoch-13-people-and-collaboration.md`

## Recent Completions (Last 30 Days)

**May 18, 2026**: Epoch 18 (Multi-Tenancy Foundation) started — plan promoted from Claude scratchpad to canonical doc; foundation worktree provisioned

- Worktree: `/Users/davidvalentine/Code/Digital-Garden/.claude/worktrees/feature+multi-tenancy` on branch `feature/multi-tenancy`, based on `132b3dc` (PR #38 publishing + observability merge).
- Detailed plan promoted to [`work-tracking/MULTI-TENANCY-PLAN.md`](work-tracking/MULTI-TENANCY-PLAN.md); epoch tracker at [`work-tracking/epochs/epoch-18-multi-tenancy.md`](work-tracking/epochs/epoch-18-multi-tenancy.md). Phase 0 (dev DB isolation via Neon branch `dev-david` on `neondb`, `pg_trgm` extension enabled, schema synced via `prisma db push`) ✅. Phase 1 (additive schema + tenancy helper module + backfill script) in progress.
- Note: the `current_epoch: 13` frontmatter and Active Epoch section below are unchanged pending your input on whether to make Epoch 18 the active focus or interleave with Epoch 13. Recommendation: promote Epoch 18 to active since the worktree is live and dev-DB-isolated.

**May 17, 2026**: Phase I.6 — user-intent gate for shrink guard (lets users clear documents intentionally)

Refinement of the Phase I.1 shrink guard. The original guard refused destructive shrinks unless `allowShrink: true` was set on the body — which blocked legitimate user actions like "select all + backspace + auto-save" unless every code path explicitly opted in. The user-intent gate uses **recent input recency** as the signal: the editor tracks `lastUserInputAt` and tags each auto-save with `userInitiated: true` when the gap is < 10 seconds. The server's shrink guard accepts either flag.

- **Phase I.6.1** (commit `315e12a`): Server-side bypass + `content:write:shrink_with_user_intent` event. The shrink-refusal at `/api/content/content/[id]` now accepts `body.userInitiated === true` OR `body.allowShrink === true`. When the shrink WOULD refuse but a flag IS set, an informational warn event records the decision with `prev_char_count`, `new_char_count`, `shrink_ratio`, which-flag-was-set, and `seconds_since_input` for calibration data.
- **Phase I.6.2** (commit `a251194`): MarkdownEditor input-recency tracking. `lastUserInputAtRef` updates on each `onUpdate` callback when the ProseMirror transaction has `docChanged === true` AND is not tagged with `y-sync$`, `remote`, or `addToHistory` (which mark remote/sync/history-merge origin). Auto-save fires include `userInitiated: true` when `now - lastUserInputAt < 10000ms`. `MainPanelContent.handleSave` accepts the meta and forwards it into the PATCH body alongside `tiptapJson`.
- **Phase I.6.3** (commit `6704d9f`): Audit + type passthrough. Verified the editor-driven save path is the only destructive content-write surface; other paths either go through the editor (and inherit recency tracking via TipTap docChanged) or use different routes that don't trigger the shrink guard. ExpandableEditor's `onSave` prop signature extended to accept the optional meta so future consumers can opt in.

Bug-class trace:
  - Editor mounts on existing content → y-sync seed transaction fires → `onUpdate` sees `y-sync$` meta → ref NOT updated → 2s later auto-save fires WITHOUT `userInitiated` → server REFUSES the shrink. ✓
  - User presses Cmd+A → Backspace → real keydown + docChanged transaction → ref updates → 2s later auto-save fires WITH `userInitiated: true` → server ALLOWS the shrink (and logs `content:write:shrink_with_user_intent` for audit). ✓
  - User edited 5 minutes ago then walked away → some background save fires → 5min > 10s window → `userInitiated: false` → server refuses. Client can retry with explicit `allowShrink: true` if appropriate. ✓

Gates at tip: `pnpm typecheck` ✓, `pnpm lint` 159/159 (0 errors), `pnpm build` ✓.

**May 17, 2026**: Phase I — anti-overwrite guards on content PATCH route + archival predev hook (response to live data-loss incident)
- Live data-loss incident on integration branch: opening a daily note in local dev (dev=prod DB) caused the editor to auto-save an empty/template doc over real content. Content recovered via a still-open mobile prod tab's y-indexeddb cache. Root cause is broader than any one trigger — the PATCH route trusted any tiptapJson body unconditionally.
- **Phase I.1** (commit `3d6a7d2`): Shrink-refusal guard on `app/api/content/content/[id]/route.ts` PATCH handler. Refuses with HTTP 422 OVERWRITE_REFUSED when existing.searchText > 200 chars AND new.searchText < 0.5 × existing AND no `allowShrink: true` on body. Emits `content:write:overwrite_refused` structured event. Span attrs `refused`, `refused_via`, `prev_char_count`, `new_char_count` record the decision.
- **Phase I.2** (commit `773bead`): Optional `If-Match: <bodyHash>` precondition. On-the-fly SHA-256 hash of tiptapJson (no schema change). Mismatch → HTTP 409 PRECONDITION_FAILED with `currentBodyHash` in meta. `bodyHash` now exposed in GET and PATCH `note` responses so clients can capture and echo it. Backwards-compatible — clients that don't send the header are unaffected.
- **Phase I.3** (commit `f89276b`): `content:write:overwrite_risk_detected` informational event for shrinks in the 50–70% range (below refuse threshold but still substantial). Allows the write but leaves a forensic breadcrumb so borderline incidents are visible in trace history.
- **Phase I.4** (commit `f2caa3f`): Replaces destructive `rm -rf .local/debug-payloads` predev hook with archival via `scripts/archive-traces.ts`. Prior-session traces move to `.local/debug-payloads/.archive/<ISO timestamp>/` with LRU sweep keeping the most recent 5 session archives. The original wipe-on-start destroyed forensic evidence from this very incident — archival is the durable fix.
- Out of scope (follow-up): client-side adoption of `If-Match` in MarkdownEditor + finding the specific trigger (daily-notes tab click suspect) that fired the destructive PATCH. Server guards are sufficient to *prevent* the data loss regardless of trigger.
- Gates at tip: `pnpm typecheck` ✓, `pnpm lint` 159/159 (0 errors), `pnpm collab:schema:check` ✓.

**May 17, 2026**: Epochs 15 + 17 integrated on branch `feature/observability-and-publishing` (ready for PR)
- Phase B–H of `epochs/epoch-15-17-integration.md` complete. 31 commits ahead of `origin/main` / 0 behind; clean fast-forward.
- Merge commit `71e37a0` absorbed `feature/publishing-system` (40 publishing commits — items/paths CRUD, revision lifecycle, scheduled-publish cron, 23 W2-W10 blocks, public renderer, jsdom-backed SSR, theme variables, polish wave). 8 files had conflicts; resolution log in the integration plan.
- Prisma client regenerated against the merged schema (13 publishing models + workspace + collab + people).
- Phase F aggressive harmonization (commit `d5678a5`): 13 publishing API routes + media upload + Vercel cron + `components/public/TipTapContent.tsx` SSR renderer + `PublishingViewMode.tsx` client component all brought up to observability standards. Each handler wrapped with `withRouteTrace`, named domain spans opened (e.g. `publishing:publish`, `publishing:sync`, `publishing:scheduled_publish_batch` with per-item child spans), `spanPayload` calls for revision bodies + diff summaries + validation reports + batch summaries. Cron handler uses `attrs.cron_run_id` (= `trace_id`) for correlation with Vercel cron history.
- Side cleanup surfaced by strict lint: 5 `@next/next/no-html-link-for-pages` `<a>` → `<Link>` migrations across `app/page.tsx`, `app/(authenticated)/settings/api/page.tsx`, `components/settings/storage/UsageTab.tsx`.
- All gates green at tip: `pnpm typecheck` ✓, `pnpm lint` 159/159 (0 errors, at ratchet), `pnpm collab:schema:check` ✓, `pnpm build` ✓ 132 pages, `pnpm trace:view --list` ✓ (Phase 6 viewer survives merge).
- Branch is pre-flight for `git push -u origin feature/observability-and-publishing` + `gh pr create`.

**May 17, 2026**: Epoch numbering reconciled + integration plan authored
- Registered Epochs 14, 15, 16, 17 explicitly in `docs/notes-feature/work-tracking/epochs/`
- Epoch 14 (Saved Content Workspaces): doc frontmatter corrected from `status: active` (stale) → `status: shipped`. The work shipped via April merge series (`a9c5570 → ... → e7c0beb`); `ContentWorkspace` models + `extensions/workplaces/` + `/api/content/workspaces/*` all on main.
- Epoch 16 (Dark Mode): `feature-dark-mode.md` → `epoch-16-dark-mode.md` (git mv, history preserved); frontmatter updated with `status: shipped`, shipped_at `2026-05-13`, shipped_via PR #37.
- Epoch 15 (Publishing): new wrapper at `epochs/epoch-15-publishing.md`. Branch `feature/publishing-system` is 40 ahead / 22 behind `origin/main`; integration plan authored.
- Epoch 17 (Observability): new wrapper at `epochs/epoch-17-observability.md` pointing at the detailed `OBSERVABILITY-CLEANUP-PLAN.md`.
- Integration plan: `epochs/epoch-15-17-integration.md` — Phases A–H for merging publishing into observability and harmonizing publishing's 12 API routes + 1 media route + cron handler to the observability standards. Integration branch will be `feature/observability-and-publishing`. Phase F is **aggressive**: spans + `spanPayload` for every route.

**May 17, 2026**: Epoch 17 — Observability Cleanup — COMPLETE in branch (worktree `observability-cleanup`, 28 commits ahead of `origin/main`)
- Phases 0–5 produced a complete three-layer observability system: structured logs (closed-set `Layer` + `Marker` enums, scalar-only `Attrs`), span traces with end-of-trace summary blocks, and per-trace payload sidecars under `.local/debug-payloads/`
- Server-side console retirement: ~80+ API routes wrapped with `withRouteTrace`, Prisma `emit: 'event'` bridge silences raw `prisma:query` stdout, every `console.*` outside the logger module is now an ESLint error
- Client-side console retirement: ~60 files, ~300 call sites across `components/`, `state/`, `hooks/`. Triage pattern: delete debug breadcrumbs covered by the trace, escalate state corrections to `clientLogger.warn`, real failures to `clientLogger.error` with scalar attrs
- Phase 5 foundation: `lib/core/logger/client.ts` (client-safe, no `node:async_hooks`), `app/api/logs/client/route.ts` beacon endpoint (auth-gated, 100/min rate limit, error/fatal only), `lib/core/logger/client-fetch.ts` `tracedFetch` wrapper, `Layer` split into `ServerLayer | FrontendLayer` closed unions
- Phase 6 trace viewer: `lib/core/logger/event-recorder.ts` writes every LogEvent to `<trace>.events.jsonl`, `scripts/render-trace.ts` builds a span tree and emits self-contained HTML (`pnpm trace:view [id]`, `pnpm trace:list`)
- ESLint deferral list shrunk: `no-console=error` now enforced in `components/`, `state/`, `hooks/`. Still deferred (with file globs as tracker): `app/**/page.tsx`, TipTap extensions, design integrations, `extensions/**`, lib utilities transitively reachable from `"use client"`
- PII firewall by type: `Attrs = Readonly<Record<string, string | number | boolean>>` makes non-scalar attrs a compile error; bulk data flows through `spanPayload()` → sidecar JSONL instead
- Gates locked at ratchet `--max-warnings 159`. `pnpm typecheck` / `pnpm lint` / `pnpm build` all green on the branch tip
- Plan docs in `docs/notes-feature/work-tracking/`: `OBSERVABILITY-CLEANUP-PLAN.md`, `FRONTEND-LOG-CHARTER.md`, `PII-AUDIT-2026-05.md`

**May 13, 2026**: Dark Mode epoch — COMPLETE
- Foundation: theme provider, `useResolvedTheme()` hook, FOUC-prevention inline script reading `notes:settings` from localStorage, `suppressHydrationWarning` on `<html>` to handle pre-hydration class application
- Settings UI: light/dark/system radio in `/settings/preferences` with live "currently dark/light" indicator
- Editor surface retrofit: `MainPanelWorkspace`, `MainPanelContent`, `MainPanelHeader`, `MainPanelNavigation`, file tree, content toolbar, root node header
- ProseMirror prose CSS: body text, placeholder, headings (muted gold light → neon gold dark), blockquote, all 5 callout types, wiki-links, block system, tables (brand-aligned shale/gold instead of grayscale)
- Block dark mode: section header, card panel, divider, accordion, tabs (gold-primary active tab), list container, periodic summary, unsupported content, habit tracker, stopwatch, calendar block (slate parchment notebook aesthetic)
- Liquid Glass surfaces refactored to CSS variables — `getSurfaceStyles()` now returns `var(--surface-glass-N-bg)` etc., auto-swapping via cascade across all 42 callsites without per-callsite changes
- Defined the previously-undefined `--text-primary`/`--text-secondary`/`--text-tertiary`/`--border-secondary`/`--surface-input` semantic vars in both `:root` and `.dark` — force-multiplier fix covering ~20 block CSS callsites
- Third-party viewer theme propagation: Mermaid, Excalidraw, DiagramsNet (override-beats-global preserved), OnlyOffice all wired to `useResolvedTheme()`
- Long-tail retrofit: dialogs (page template, category move, people profile/create/workspace/mount-picker), sidebar headers, settings pages (preferences, calendar, templates, api, mcp, storage, export), admin pages (users, content, audit-logs, collab-doc), AI surfaces (chat panel, messages, input, snippet/suggestion menus, model picker), flashcards (panel, review overlay, quick add form, settings dialog), common surfaces (confirm dialog, navigation history, left sidebar collapsed, file node, backlinks panel)
- Flashcard polish: flip animation now has easeOutBack rotateY curve with mid-flip scale dip and shadow color shift; edit affordance minimized to a transparent icon-only button revealed via group-hover
- Auth pages: home, sign-in, sign-up retrofitted for both themes
- Playwright e2e harness scaffolded: operational dark-mode coverage (4 signed-out routes, 8 baseline snapshots) + 10 non-operational stubs across 6 regression categories (auth, editor, file-tree, content, search, extensions). `pnpm test:e2e`, `:e2e:update`, `:e2e:report` scripts wired. `tests/e2e/README.md` documents conventions.
- Sprint A.0 dev toggle and Sprint C.6 cleanup: removed `components/dev/DevThemeToggle.tsx` after production toggle confirmed working
- Slash command bug discovered + fixed during dark mode visual QA: missing client registration of `ExcalidrawBlock` and `MermaidBlock` in `extensions-client.ts`, plus restructured to create-then-insert pattern to avoid collab sync race
- Branch: `feature/dark-mode`. `pnpm build`, `pnpm collab:schema:check`, `pnpm typecheck` all pass

**May 4, 2026**: Browser overlay, associated content, and web notes foundation
- Added canonical-first webpage identity with new `WebResource`, `WebResourceContentLink`, and `WebResourceViewState` models plus `ExternalPayload.webResourceId`
- Added a new `/api/integrations/browser-extension/*` API surface for resource context, webpage associations, content-picker tree, note/external overlay editing, and per-install overlay view-state persistence
- Broadened the right-sidebar `Backlinks` affordance into a generalized `Links` panel for notes and external links while preserving the existing sidebar slot and tab compatibility
- Added app-hosted overlay editing routes under `/extension-overlay/note/[id]` and `/extension-overlay/external/[id]` for trusted extension sessions
- Added an in-page extension overlay shell that can resolve webpage context, open associated notes/external links, quick-add current pages into trusted bookmark-sync connections, and reopen saved overlay state on revisit
- `npx prisma generate`, `pnpm typecheck`, and `pnpm build` passed; additive SQL for the new web-resource tables and `ExternalPayload.webResourceId` was applied safely without table drops

**Apr 30, 2026**: Browser bookmarks sync foundation
- Added a new browser-bookmarks integration surface with bearer-token auth, connection management, bootstrap, push/pull sync, and reading-queue API routes
- Expanded external references with normalized/canonical URL metadata, reading status, favicon/domain metadata, capture metadata, dedupe metadata, and preserve-HTML support
- Added persistent bookmark sync models for extension tokens, browser/app root connections, and per-node sync mappings
- Added an in-repo `extensions/browser-bookmarks/` package with a Digital Garden settings page plus a Chromium MV3 extension scaffold for popup, options, capture, bookmark observers, session capture, and rules import/export
- Build gate and typecheck passed; browser-level Chrome/Vivaldi smoke testing remains manual

**Apr 29, 2026**: Stopwatch block prototype
- Added a new document-local `stopwatch` TipTap block with persisted wall-clock timing, lap capture, and multiple visual style variants
- Implemented count-up stopwatch state from saved `startedAt + accumulatedMs`, allowing timers to continue accurately across reloads until explicitly stopped
- Added a dedicated Stopwatch properties panel for title, style variant, accent color, lap visibility, and display toggles
- Wired the block into editor schema/versioning, slash commands, HTML export, Markdown export, and plain-text export
- Build gate passed on branch `codex/habit-tracker-block-prototype`

**Apr 28, 2026**: Habit tracker block prototype
- Added a new document-local `habitTracker` TipTap block with three presets: monthly grid, weekly grid, and streak cards
- Introduced inline boolean and count-based check-ins with computed completion rate, hit-day totals, and current streak rollups
- Added a dedicated Habit Tracker properties panel for tracker settings, habit list management, and mode/target customization
- Wired the block into editor schema/versioning, slash commands, HTML export, Markdown export, and plain-text export
- Build gate passed on branch `codex/habit-tracker-block-prototype`

**Apr 26, 2026**: Unsupported TipTap block safety net
- Added schema-aware TipTap normalization that rewrites unknown/deprecated nodes before editor load, collaboration bootstrap, or server rendering
- Introduced `unsupportedBlock` and `unsupportedInline` safety nodes so deprecated content stays visible and preserved instead of crashing schema bootstrap
- Collaboration bootstrap now seeds through the sanitized schema path, preventing old block definitions from forcing blank documents or false hard-block states
- Note create/update APIs normalize incoming TipTap JSON before persistence so deprecated blocks are gated consistently after save
- Template and snippet insertion now sanitize structured TipTap inserts before applying them to live editors

**Apr 26, 2026**: Collaboration bootstrap fallback hardening
- Narrowed `bootstrap-failed` to true structural/bootstrap invalidity instead of transient collaboration service unavailability
- Added staged collaboration boot messaging: normal boot, "taking longer than expected", and warned local fallback after prolonged canonical-state delays
- Enabled warned local editing from saved note TipTap JSON when canonical collaboration bootstrap is unavailable but durable local persistence is ready
- Kept editing blocked when canonical state is structurally inconsistent, saved note content cannot be transformed safely, or local persistence cannot initialize
- Markdown editor now surfaces runtime-provided collaboration boot warnings instead of a fixed loading banner

**Apr 7, 2026**: Epoch 13 planning initialized
- Created isolated worktree from `origin/main` after PR #22 merge commit `2acc6d9b9fc8bad4a8e7e634f865c19607b0e0ce`
- Documented the People + Collaboration epoch starting at Sprint 58
- Locked the architecture decision to render People groups/subgroups folder-like without adding `ContentType.group`
- Captured collaboration route/access decisions: owners and signed-in grantees use `/content`; public `/share` is view-only for non-users in v1

**Mar 25, 2026**: Sprint 53 Quad Split — COMPLETE
- Added four layout modes: single, dual vertical, dual horizontal, and quad split from the same workspace model
- Shared workspace toolbar now controls the focused pane instead of rendering per pane
- Right-click `Open In Pane` expands the workspace when the requested pane is not currently visible
- Multi-pane debug surfaces are suppressed when pane count is greater than one
- Split orientation remount fix prevents vertical/horizontal mode confusion after repeated toggles
- Pane switching no longer refetches content just because focus changed
- Tab placement now follows persistent horizontal/vertical user preference instead of transient visible-pane merges
- Active tab styling refined with flush underline and conservative lift
- Build gate passed
- Manual smoke passed on port `3001`

**Mar 24, 2026**: Sprint 51 Sidebar Isolation + Workspace Preservation — COMPLETE
- Persisted right-sidebar runtime per content via `state/right-sidebar-state-store.ts`
- Sidebar panels now receive explicit `contentId` scope instead of relying on the global selection singleton
- Outline store now clears invalid active heading/chat-outline selections when content-specific outlines refresh
- Editor instance store now clears stale AI edit runtime when an editor unmounts
- Navigation history remains pane-scoped and filters invalid cleared-content entries
- Workspace restoration now keeps the active tab restorable in URL/localStorage when leaving content and returning
- Repaired Epoch 12 Sprint 50/51 worktree git indirection under `Digital-Garden. nosync/.worktrees/`
- Targeted eslint on changed files passed
- Build gate passed

**Mar 13, 2026**: Sprint 42 AI Image Generation — COMPLETE
- 8-provider image generation system: OpenAI (DALL·E 3, GPT Image 1), Google (Imagen 3), DeepAI, fal.ai (FLUX.1 Dev/Schnell), Together AI (FLUX/SDXL), Fireworks AI, RunwayML (Gen-3), Artbreeder
- `generate_image` chat tool: LLM generates images from text prompts, auto-uploads to storage, creates referenced FilePayload
- GeneratedImageCard in ChatMessage: rendered image with AI badge, provider info, prompt display
- "Insert into document" button: dispatches `insert-ai-image` CustomEvent, MarkdownEditor inserts at cursor
- Drag-and-drop: draggable images from chat to TipTap editor via `application/x-dg-ai-image` data transfer
- Image generation API route: `/api/ai/image` — standalone endpoint for direct generation
- Provider catalog with model metadata (sizes, quality/style support)
- Works in both ChatPanel (side chat) and ChatViewer (content node chat)
- 10 files changed, 5 new files
- Build gate passed

**Mar 12, 2026**: Sprint 41 Chat Content Outlines — COMPLETE
- Chat outline extractor: parses UIMessage[] into navigable entries (user prompts, assistant summaries, tool calls)
- Granularity toggle: "compact" (messages only) vs "expanded" (headers, lists, images from assistant markdown)
- ChatOutlinePanel component with role-based SVG icons (user, assistant, tool) and dot-and-indent sub-items
- Outline tab now available for `chat` content type (tool registry expanded)
- Real-time outline sync: ChatViewer feeds messages into outline store as they stream
- Click-to-scroll: outline entries dispatch `scroll-to-chat-message` CustomEvent, ChatViewer scrolls with gold flash animation
- Outline store extended with chat-specific slice (separate from note outline)
- 6 files changed, 2 new files
- Build gate passed

**Mar 12, 2026**: Sprint 40 AI Edit Highlighting + AI Image Insert — COMPLETE
- `aiHighlight` ProseMirror Mark extension: `inclusive: false`, `source` attribute, `<span class="ai-highlight" data-source="ai">`
- Registered in both client and server extension sets
- AI highlight CSS: indigo tint + bottom border, hover state, `.ai-highlight-hidden` toggle class
- Orchestrator auto-marks all AI-inserted content (both `typeText` and `insertStructuredContent`)
- `replace_document` marks entire document as AI content
- `insert_image` tool (9th editor tool): inserts image from URL with `source: "ai-generated"`
- AI badge on ImageBubbleMenu for AI-generated images
- "Show AI Content Highlights" toggle in AI settings (validation schema + settings page)
- CSS class toggle approach: hides highlights without removing marks from document
- Fixed selection highlight regression: deferred `setEditable(false)` to Phase 3 so native selection renders in Phase 2
- 8 files changed, 1 new extension file
- Build gate passed

**Mar 11, 2026**: Sprint 39 AI Text-Editing Tools — Client-Side Architecture — COMPLETE
- 8 agentic tools: read_first_chunk, read_next_chunk, read_previous_chunk, apply_diff, replace_document, plan, ask_user, finish_with_summary
- Client-side editing architecture: tools return structured payloads, frontend applies to live TipTap editor
- Editor instance Zustand store: shares TipTap editor between editor component and chat panel
- ProseMirror text search utility: finds exact text positions in document for AI edits
- AI edit orchestrator: 4-phase animation (cursor arrival → selection → content insertion → settle)
- Editor lock with 30s timeout failsafe, queued execution, abort on navigation
- Dual insertion strategy: char-by-char typing for inline text, parsed node-by-node for structured content
- Fixed `markdownToTiptap` — added `marked` for proper markdown → HTML → TipTap JSON pipeline
- Dev-only debug toggle in chat tool call bubbles (raw response viewer)
- "AI is editing..." indicator in chat panel
- AI editor behaviors living document: docs/notes-feature/features/ai-editor-behaviors.md
- 10 files changed, 4 new files
- Build gate passed

**Mar 11, 2026**: Sprint 38 Providers + BYOK Persistence + Rich Bot Responses — COMPLETE
- 4 new AI providers: Google Gemini, xAI Grok, Mistral, Groq (6 total)
- BYOK key persistence: encrypted DB storage, CRUD API, verify endpoint
- AIKeyManager settings UI: per-provider key input, masked display, verify button
- ChatMessage rich markdown rendering: react-markdown + remark-gfm + lowlight syntax highlighting
- Code blocks with copy button, tables, lists, blockquotes, inline formatting
- Build gate passed

**Mar 8, 2026**: Sprint 37 Images in TipTap + Referenced Content Lifecycle — COMPLETE
- Image extension with contentId, source, uploading, width attributes
- Upload via slash command (/image), paste (files + image URLs), drag-and-drop from Finder
- Referenced content lifecycle: ContentLink sync on save, orphan soft-delete, cascade move
- Image bubble menu with size presets (S/M/L), alt text, delete
- Vanilla DOM NodeView with drag-to-resize handle
- Deferred: figure/caption, markdown export, lazy loading

**Mar 6, 2026**: Sprint 36 Table Rebuild + Link Fix + Cleanup + Focus Guardrails — COMPLETE
- Console cleanup: removed console.log/console.warn from editor code (kept console.error)
- Focus guardrails: removed `.focus()` from TableBubbleMenu chains, added `preventFocusLoss`
- Focus guardrails: removed `setTimeout` focus hack from slash command table insertion
- Link: documented `inclusive: false` default (cursor adjacent to links doesn't inherit formatting)
- HeadingHardbreakSplit extension: `## ` in paragraph with hardBreak only converts text before break
- BlockquoteLineOnly extension: `> ` in paragraph with hardBreak only quotes text before break
- Table rebuild: removed old CSS, added minimal TipTap-docs-based styles, enabled `resizable: true`
- Registered new extensions in both client and server extension sets
- Build gate passed
- 8 files changed, 2 new extension files

**Mar 6, 2026**: Sprint 35 TipTap Rules Doc + Input Rule Bug Fixes — COMPLETE
- TIPTAP-EDITOR-RULES.md created (living document — expand as features are added)
- Tag autocomplete 2-second delay before popup appears (heading shortcuts get priority)
- `##` in query immediately dismisses tag autocomplete via `allow()` guard
- Space during delay propagates to ProseMirror for heading conversion (`# ` → H1)
- Slash command restricted to first character of empty lines only
- HeadingBackspace extension: empty H1→`#`, H2→`##`, H3→`###` in paragraph
- Removed macOS Finder duplicate `index.d 2.ts` from Prisma generated output
- Build gate passed
- 4 files changed, 1 new extension file

**Mar 1, 2026**: Sprint 34 Chat UI, AI Tools, @ Mentions — COMPLETE
- ChatPanel (right sidebar): transient streaming chat with "Save conversation" to file tree
- ChatViewer (main panel): full-page persistent chat with auto-save to ChatPayload
- ChatPayload CRUD in content API (GET/PATCH/POST)
- AI tools registry (searchNotes, getCurrentNote, createNote) with Prisma execution layer
- ModelPicker component for per-session provider/model override
- Tool settings UI (tool choice, enable/disable individual tools)
- @ file mentions: inline search → system prompt injection → clickable mention pills
- / tool commands: browse AI tools with prompt hints
- ChatSuggestionMenu: shared keyboard-navigable dropdown for both chat surfaces
- Sidebar tab auto-switch when content type changes
- MessageCircle icon for chat nodes in file tree
- Chat export as Markdown from toolbar
- Editor state persistence fix (collapse/reopen no longer loses edits)
- Root page redirect (session-based, replaces legacy AppNav)
- Global error boundary
- 29 files changed, +2,237 lines
- Build gate passed

**Feb 27, 2026**: Sprint 33 AI Foundation + Settings UI — COMPLETE
- AI SDK v6 installed and Zod v4 compatibility confirmed
- Provider registry with dynamic imports (Anthropic + OpenAI)
- Streaming chat API route with auth + middleware
- `/settings/ai` page: provider selection, generation params, feature toggles, usage tracking
- Build gate passed

**Feb 27, 2026**: Sprint 32 Editor Stability & Polish Complete
- BubbleMenu persistence fix (root cause: shared meta key cross-contamination)
- Outline click-to-scroll via CustomEvent bridge
- ExpandableEditor tag/wiki-link callback threading
- Tag/heading `# ` conflict fix
- Build gate passed

**Feb 26, 2026**: Sprint 31 Lossless Export/Import Round-Trip Complete
- Custom two-pass markdown parser → TipTap JSON
- Sidecar reader, Import API, toolbar button
- Pending manual testing (macOS Finder issue)

**Feb 25, 2026**: Sprint 30 Universal Expandable Editor Complete
**Feb 24, 2026**: Sprint 29 Tool Surfaces Architecture Complete

## Up Next

### Epoch 12: Sprint 54 - Tab Drag + Adaptive Pane Reshaping
Direct tab dragging between panes, single-pane split targets, and adaptive layout collapse are in progress. Next checkpoint is manual smoke on port `3001`.

**See**: [Epoch Plans](work-tracking/epochs/) for detailed sprint breakdowns

## Known Issues & Blockers

### Active Blockers
- **macOS Finder**: File picker not opening on dev machine — blocks manual testing of import feature
- **macOS mmap**: `mmap failed: Operation timed out` on `git push` from main working directory — workaround: git bundle → fresh clone → push from /tmp

### Known Editor Bugs
- *(All Sprint 36 targets resolved — see Recent Completions)*

### Known Limitations
- **Sprint 31 Import**: Untested pending Finder fix
- **PDF/DOCX Export**: Stub implementations
- **AI Chat**: Requires user-provided API keys (BYOK configured in /settings/ai)
- **Outline Panel**: Auto-scroll on editor scroll needs intersection observer
- **Chat mentions**: Only injects note `searchText` (max 2000 chars), not full TipTap JSON

### Technical Debt
- [ ] Server-side TipTap extensions missing WikiLink and Tag parsers
- [ ] Metadata sidecar import consumer not yet implemented
- [ ] Chat export only handles plain text messages (no tool call/result rendering)

## Metrics

### Velocity (Last 6 Sprints)
- Sprint 29: ~20 points (Tool Surfaces)
- Sprint 30: ~15 points (Universal Editor)
- Sprint 31: ~20 points (Import System)
- Sprint 32: ~15 points (Editor Stability & Polish)
- Sprint 33: ~18 points (AI Foundation + Settings)
- Sprint 34: ~25 points (Chat UI + Tools + Mentions)
- **Average**: ~19 points/sprint

### Epoch Progress
- **Epoch 7** (AI Integration): ✅ Sprints 33-34 complete; Sprints 35-36 redirected to Epoch 8
- **Epoch 8** (Editor Stabilization): ✅ Complete — Sprints 35-36 complete
- **Epoch 9** (Editor Enhancements): Sprint 37 complete; remaining sprints deferred to Epoch 11
- **Epoch 10** (AI TipTap): ✅ Complete — Sprints 38-42 complete

## Roadmap

### Epoch 10: AI TipTap (✅ Complete — Sprints 38-42)
**Theme**: AI providers, BYOK, agent editing tools, edit highlighting, chat outlines, image generation
**Status**: 5/5 sprints complete ✅

### Epoch 11: Editor Enhancements (Planned — Remaining Epoch 9)
**Theme**: URL/OG embeds, YouTube, drag/reorder, templates, snapshots, context menu

### Future (Unplanned)
- **Collaboration & Sharing** — real-time editing, sharing, security review
- **UI Revisions** — theming, custom styles
- **Main Panel Multiple Tabs** — multi-document editing
- **YouTube Playlists & Summarizing** — video content management

## Quick Links

- [Current Sprint](work-tracking/CURRENT-SPRINT.md) - Sprint 54 details
- [Backlog](work-tracking/BACKLOG.md) - Prioritized work items
- [Epoch Plans](work-tracking/epochs/) - Epoch 8, 9, 10, future stubs
- [TipTap Editor Rules](guides/editor/TIPTAP-EDITOR-RULES.md) - Editor behavior rules
- [AI Development Guide](../CLAUDE.md) - For AI assistants
- [Start Here](00-START-HERE.md) - Documentation index

---

**Last Updated**: Mar 12, 2026
**Next Review**: Sprint 42 kickoff (AI Image Generation)
