---
epoch: 15
title: Publishing System — Public Portfolio + Blog
status: in_review
started: 2026-04-XX
authoring_completed: 2026-05-11
integrated_with_observability: 2026-05-17
last_updated: 2026-05-17
worktree: /Users/davidvalentine/Code/Digital-Garden-publishing
branch: feature/publishing-system
integration_branch: feature/observability-and-publishing
---

# Epoch 15: Publishing System

## Objective

Turn the Digital Garden into a public portfolio + blog while reusing the existing TipTap editor. Single owner/admin author; multi-tenant ready via `ownerId` on all new models. The home page is intentionally hardcoded (deferred per user direction); public output lives on independent URL paths rather than mirroring the internal `ContentNode` hierarchy.

**Reference model:** `PublicItem` → `ContentNode` (1:many intentional). A single source note can be surfaced through multiple `PublicItem` placements.

## Architecture (locked in)

- **`PublicPath`** — independent URL path tree, not the internal ContentNode hierarchy.
- **`PublicItem`** — reference from `(path, slug)` → `ContentNode`, with 7 typed payload variants (`BlogPost`, `Project`, `ProfileSection`, `CaseStudy`, `Bookmark`, `Page`, `MediaItem`).
- **`PublicItemRevision`** — immutable snapshots. *Working* (mutable, autosaved) vs *published* (immutable, live).
- **`PublicPathRedirect`** — preserve old URLs when paths move.
- **`PreviewToken`** — share unpublished revisions via signed link.
- **Publish lifecycle:** `draft → published / scheduled / unpublished / archived`. "Pending changes" derived from `bodyHash` diff between working and published revisions.
- **`BlockViewMode`** context (`edit | viewer | public`) gates editor affordances via `.block--editable` CSS.
- **Theme system + CSS variable boundary** in `lib/design/themes/`.
- **Multi-tenant ready:** `ownerId` on all new models.
- **Vercel cron** `*/5 * * * *` (relaxed to daily on Hobby plan) for scheduled publish.

## Sprint / wave summary

### W1 — Generic blocks (in `lib/domain/editor/extensions/`)
`Image` (wrap modes), `Quote`, `TableOfContents`, `PullQuote`. These are reusable across both internal notes and public output.

### W2–W10 — Publishing-only blocks (in `extensions/publishing/blocks/`, 27 total, 23 added across these waves)
`Gallery`, `HeroImage`, `PostCard`, `ProjectCard`, `RecentPosts`, `Timeline`, `StatBlock`, `MetricsStrip`, `ProcessSteps`, `TestimonialCard`, `CtaBanner`, `VideoEmbed`, `FaqAccordion`, `FeatureList`, `PersonCard`, `NewsletterSignup`, `LogoStrip`, `SocialLinks`, `PricingCard`, `Spacer`, `SkillBadges`, `BookmarkCard`, `TagCloud`.

### Authoring polish wave (2026-05-11)
- Inline editing for atom blocks via `lib/domain/blocks/inline-edit.ts` — `makeEditableField()` + `syncEditableField()` using contenteditable + WeakMap ref pattern. Applied to Person/Bookmark/Stat/Post/ProjectCard.
- Properties Panel revert fix: `block-focus-ext.ts` now calls `setSelectedBlock()` after dispatch so the block-focus plugin's clearSelection-on-non-NodeSelection doesn't strand the panel.
- Image center wrap mode (`[data-wrap="center"]`) + ImageBubbleMenu ⊟ ↤ ⊡ ↦ buttons.
- Pull-quote min-width 200px to prevent unreadable narrow floats.
- StatBlock + FeatureList custom colors (`bgColor` + `bgGradient`) — every dark-theme block in publishing now has them.
- `.ProseMirror`-scoped light-theme CSS overrides for dark-theme published blocks (StatBlock, PostCard, ProjectCard) so editor previews stay readable while public output stays dark.
- `node-view-factory` `stopEvent` passes through `[contenteditable="true"]` for inline-editable fields inside atom blocks.
- Slash-menu tab affordance: **All / Editor / Published**. Defaults to All. `SlashCommand.kind?: "editor" | "published"`. 25 publishing blocks tagged. Tab key cycles tabs.

### Codex sub-branch merge (2026-05-11)
- Merged `codex/habit-tracker-block-prototype` (4 commits) into publishing: brings in `stopwatch`, `habit-tracker`, browser-extension, web-resources, bookmark-sync features.
- 16 files had conflicts; all resolved (additive merges for `prisma/schema.prisma`, `app/globals.css`, dedupes for `collaboration/extensions.ts`).
- Prisma client regenerated against merged schema (96k+ line diff in `chore(prisma)` commit).

## API surface

### New routes (12 + 1 media)
- `POST /api/media/upload` — file upload for inline image / media-item flows.
- `GET/POST /api/publishing/items` — list / create PublicItems.
- `GET/PATCH/DELETE /api/publishing/items/[id]` — CRUD on PublicItem header.
- `POST /api/publishing/items/[id]/publish` — promote working revision to published.
- `POST /api/publishing/items/[id]/unpublish` — flip live revision to unpublished status.
- `POST /api/publishing/items/[id]/schedule` — schedule a future publish.
- `POST /api/publishing/items/[id]/sync` — pull latest payload from source `ContentNode` into the working revision.
- `POST /api/publishing/items/[id]/validate` — pre-publish validation (broken links, missing assets, schema check).
- `GET/POST /api/publishing/items/[id]/revisions` — revision history + create new working revision.
- `GET/POST /api/publishing/paths` — list / create paths.
- `GET/PATCH/DELETE /api/publishing/paths/[id]` — CRUD on path including redirects.
- `GET /api/publishing/scheduled-publish` — Vercel cron handler (auth via cron secret).

### Public renderer
- `app/(public)/layout.tsx` — public-side root layout (no app chrome).
- `app/(public)/[...path]/page.tsx` — catch-all route resolves `PublicPath` + `PublicItem` and dispatches to the typed payload renderer.

## Server registration chain (verified)

`extensions/publishing/server-runtime.ts` → `lib/extensions/server-installed.ts` → `getExtensionServerEditorExtensions()` → `getServerExtensions()` → `TipTapContent.tsx`. Every TipTap block authored in publishing has a `Server*` variant registered.

## Branch state at integration time

- Branch: `feature/publishing-system`
- Tip: `d39c2f4` — `Merge remote-tracking branch 'origin/main' into feature/publishing-system` (stale merge from 2026-05-12)
- Divergence vs `origin/main`: **40 ahead, 22 behind** (had not absorbed dark-mode merge, AGENTS.md, or main's lint gate)
- 118 files changed, ~46K net insertions vs main (dominated by the regenerated Prisma client)
- 40 commits since the fork point, including 5 atomic publishing commits + the codex merge + the prisma-regen commit

## Known gaps (deferred or out-of-scope for this PR)

1. **H0–H12 home page** — explicitly deferred. Home page stays hardcoded.
2. **Variant preview parity** — non-rewritten blocks (Testimonial, Tags, SkillBadges, Timeline, ProcessSteps, SocialLinks, LogoStrip, FAQ) use inline HTML and don't visually differentiate variants. Five rewritten blocks (Person/Bookmark/Stat/Post/ProjectCard) DO show variant differences via CSS classes.
3. **Production cron secret + sender domain** — Vercel project env vars need final values for `CRON_SECRET` and any newsletter sender.

## Integration with Epoch 17 (Observability)

This epoch is merging into the observability cleanup branch via the integration plan in [`epoch-15-17-integration.md`](epoch-15-17-integration.md). Observability harmonization brings the 12 publishing API routes + 1 media route up to the same `withRouteTrace` + structured-logger standards the rest of the app now uses.

## Reference docs

- This file — epoch wrapper / status of record
- [Authoring polish memory note](../../../../../../../.claude/projects/-Users-davidvalentine-Code-Digital-Garden/memory/project_publishing_system.md) — verbose snapshot from authoring-polish wave
- Prisma schema additions live in `prisma/schema.prisma` (13 new models)
