---
epoch: 19
title: Flashcards FSRS — Anki-Grade Spaced Repetition + Editor Block
status: shipped_in_branch
started: 2026-05-20
completed: 2026-05-22
last_updated: 2026-05-22
worktree: /Users/davidvalentine/Code/Digital-Garden-flashcards-fsrs
branch: epoch-19/sprint-1-flashcards-schema
detailed_plan: ../FLASHCARDS-FSRS-PLAN.md
---

# Epoch 19: Flashcards FSRS

## Objective

Replace the binary `review | mastered` flashcard outcome model with Anki-grade spaced repetition via the FSRS algorithm, and add a `flashcardEmbed` TipTap block so users can embed a global deck (or pinned card subset) inline in any note. Cards resurface at progressively longer intervals tuned to "the point of weakest memory," with per-user parameter optimization scaffolding for v1.1.

Flashcards remain global — the editor block stores only references (`deckId`, `cardIds`), never card payloads. Deleting a note never deletes the cards or decks it references.

## Architecture

**Algorithm:** FSRS via [`ts-fsrs`](https://github.com/open-spaced-repetition/ts-fsrs) (same algorithm shipped in Anki 23.10+). Models stability and difficulty separately for accuracy at "shown right when weakest"; per-user 19-weight parameter array; optimizer retunes from review history (v1.1 target).

**Deck model:** Sidecar `FlashcardDeck` table, Anki-style nested via `parentDeckId` + materialized `path` (e.g. `"spanish/verbs/irregular"`). Cards point to one home deck via `Flashcard.deckId`.

**Editor block:** `flashcardEmbed` TipTap node — atomic, draggable, attrs-only. Stores `{ deckId, cardIds?, defaultMode, showRatingButtons }`. NodeView renders inline flip preview + study/reference mode toggle + Play button that opens the existing `FlashcardReviewOverlay` with a `{ deckId, cardIds }` filter.

**Migration strategy:** Expand → migrate → contract. Migration A (additive) shipped in Sprint 1; Migration B (backfill script) ready to run; **Migration C (destructive drops) deferred to Sprint 6** — see "Open work" below.

## Sprints (all shipped on this branch)

### Sprint 1 — Schema expand + backfill script

Commit: `5b51c09 feat(flashcards): Migration A — FSRS schema expand`

- `FlashcardDeck` table (nested, materialized path, soft-delete)
- New enums: `FlashcardState`, `FlashcardRating`, `FlashcardCardType`
- `FlashcardReviewMode` extended with `reference` for inline-block skims
- `Flashcard` +14 columns: `deckId` (nullable), `cardType`, FSRS state (`state`, `due`, `stability`, `difficulty`, `elapsedDays`, `scheduledDays`, `reps`, `lapses`), soft-delete/suspend/archive timestamps
- `FlashcardReviewAttempt` +9 columns: `rating` (nullable for reference skims) + FSRS audit trail
- `User` +4 columns: `fsrsParameters`, `desiredRetention`, `fsrsMaxInterval`, `defaultFlashcardDeckId`
- `scripts/backfill-flashcard-decks.ts` — Migration B as re-runnable script with `--dry-run` and `--owner=<uuid>` flags. Per-owner transactions; safe to retry.

### Sprint 2 — FSRS scheduler + API surface

Commit: `d511a01 feat(flashcards): FSRS scheduler + deck/queue/review/parameters API`

- `lib/domain/flashcards/fsrs/` — `scheduler.ts`, `parameters.ts`, `optimizer.ts` (stub), `types.ts`
- `scripts/fsrs-scheduler-smoke.ts` — 8 property assertions; **caught a real bug** (missing `learningSteps` persistence) before any UI code touched the scheduler. Followed up with Migration A.1 (`20260521090000_add_flashcard_learning_steps`).
- 8 new API routes under `app/api/flashcards/`:
  - `POST /decks` + `GET /decks/tree` + `GET/PATCH/DELETE /decks/[id]`
  - `GET /queue` — FSRS-prioritized due-now queue with deckId/cardIds filters
  - `POST /review` — 4-button FSRS rating submit; returns updated card + audit log + `nextCardId`
  - `GET /stats` — global + per-deck aggregate counts
  - `GET/PATCH /parameters` — user FSRS settings
  - `POST /parameters/optimize` — 3-tier response (NOT_READY / NOT_IMPLEMENTED / 200)

### Sprint 3 — 4-button overlay refactor

Commit: `94496dd feat(flashcards): 4-button FSRS rating overlay + filter prop`

- `FlashcardReviewOverlay`: binary outcome row → 4-button rating row (Again / Hard / Good / Easy) with predicted-interval labels under each button
- Optional `filter: { deckId?, cardIds?, includeNew?, limit? }` prop — when set, overlay fetches its own queue from `/api/flashcards/queue`
- Predicted intervals computed client-side via `previewIntervals()` + `getDefaultParameters()` (no extra round-trip)
- Keyboard shortcuts: `1/2/3/4` rate (only when flipped), `space` flip, `Esc` close, `S` skip, `R` recycle
- Three new empty/error states: queue loading, fetch error, no cards due
- Animation: `getExit()` maps 4 rating intents to distinct slide directions
- **Preserved verbatim**: drag/swipe, card flip (rotateY), edit-in-place, layered backdrop, view tracking

### Sprint 4 — `flashcardEmbed` TipTap block

Commits: `c944476 feat(flashcards): flashcardEmbed TipTap block + NodeView` · `ea81291 fix(flashcards): split flashcard-embed into server-safe + client files` · `fe3050e fix(flashcards): add /flashcards entry to the slash-command static list`

- `lib/domain/editor/extensions/blocks/flashcard-embed.tsx` — server-safe (schema, `registerBlock`, `ServerFlashcardEmbed`, shared `flashcardEmbedAttrSpec()`)
- `lib/domain/editor/extensions/blocks/flashcard-embed-client.tsx` — client-only (`FlashcardEmbed` with `addNodeView` via `createBlockNodeView` + `createRoot` mount bridge)
- `extensions/flashcards/components/FlashcardEmbedNodeView.tsx` — React NodeView: deck header, single-card flip preview, mode toggle pill, Play button → `FlashcardReviewOverlay`
- Registered in all four extension sets: client, server, collab. Schema version bumped 1.7.0 → 1.8.0 (MINOR — additive new node, no migration in `lib/domain/export/migrations.ts`)
- `/flashcards` slash command (with aliases: anki, fsrs, deck, study, spaced, repetition)

**File-split note**: the original Sprint 4 commit kept client + server Nodes in the same file, which Turbopack rejected because `react-dom/client` got transitively pulled into the server bundle. The fix split client-only code into a sibling file; shared attribute spec exported from the server-safe file prevents drift.

**Dual-registry wart caught**: `registerBlock({ slashCommand: "/flashcards" })` populates `lib/domain/blocks/registry.ts` (consumed by Properties Panel + Block Picker), but the actual `/` menu reads from a separate hardcoded array in `lib/domain/editor/commands/slash-commands.tsx`. New blocks need **both** registrations. Filed as a Sprint 6 cleanup candidate (collapse to single source of truth).

### Sprint 5 — Deck picker + epoch wrap-up

- `FlashcardDeckPickerDialog` — portal-mounted modal with tree view, search, and inline "Create new deck" form. Used by `FlashcardEmbedNodeView`'s no-deck state.
- Wired the dialog into the block; the previously-scaffolded `updateAttrs()` helper persists `{ deckId }` to the node when the user picks.
- This epoch tracker; plan doc closeout.
- Migration C deferred to Sprint 6 (shipped in the same PR — see below).

### Sprint 6 — Legacy column sunset + Migration C

Commit: `<this sprint's commit>` (see git log)

Migration C ran end-to-end on the same branch as Sprints 1–5, deviating from the original plan that had Sprint 6 as a separate PR. The deviation is justified: PR #44 was still in review, so adding Sprint 6 commits avoided the cost of a dependent PR cascade. The destructive migration is gated behind 3 expand-pattern prerequisites (Migration A applied, Migration B run, app code reading from FK paradigm only) — all satisfied before the commit.

**Server-side compatibility shim approach (the key design call):** instead of rewriting the ~900-line `FlashcardsPanel` and ~450-line `FlashcardQuickAddForm` to consume the FK paradigm directly, the legacy API routes were rewritten to *derive* the old `{category, subcategory, reviewStatus}` shape from the new FK paradigm at the server boundary. The UI consumes the same DTO it always has; the underlying source pivoted to `FlashcardDeck` + FSRS state. This deferred ~1500 lines of client-side rewrite to a future polish sprint without blocking Migration C.

**Files touched:**
- `lib/domain/flashcards/legacy-compat.ts` (NEW) — `deriveLegacyCategoryAndSubcategory`, `deriveLegacyReviewStatus`, `resolveLegacyDeckId`, `deriveStateFromLegacyStatus`
- `lib/domain/flashcards/api.ts` — `FLASHCARD_SELECT` joins `deck` with `parent.name`; `toFlashcardDto` derives `category`/`subcategory`/`reviewStatus`/`reviewCount` from FK + FSRS state; `masteredAt` returns null (one-time data loss, see below)
- `app/api/flashcards/route.ts` (POST + GET) — accepts `deckId` OR legacy strings; resolves legacy strings via `resolveLegacyDeckId`; reads no longer touch legacy columns
- `app/api/flashcards/[id]/route.ts` (PATCH + DELETE) — accepts `deckId`; translates `reviewStatus` PATCHes to FSRS state changes via `deriveStateFromLegacyStatus`; DELETE soft-deletes (sets `deletedAt`) instead of hard-deleting
- `app/api/flashcards/[id]/review/route.ts` (legacy outcome endpoint) — drops `reviewStatus`/`reviewCount`/`masteredAt` writes; logs the attempt audit row + touches `lastReviewedAt` only. The new `/api/flashcards/review` endpoint remains the canonical FSRS path.
- `app/api/flashcards/decks/route.ts` (legacy aggregate GET + rename PATCH) — derives aggregate counts from `FlashcardDeck` table + Prisma `groupBy` on cards; rename PATCH translates to deck rename / cross-deck card move with 3 code paths (rename / move-up / move-down)
- `app/api/flashcards/options/route.ts` — `categories` derived from root deck names; `subcategoriesByCategory` derived from parent→child deck relationship
- `app/api/flashcards/count/route.ts` — `reviewStatus: { not: "archived" }` → `state: { not: "archived" }`
- `app/api/flashcards/review/route.ts` (new FSRS endpoint) — drops the back-compat `reviewStatus`/`reviewCount` writes that were in Sprint 2 (now dead code post-Migration-C)
- `prisma/migrations/20260522120000_flashcards_migration_c_legacy_sunset/migration.sql` (NEW) — the destructive migration: drops 2 legacy indexes, promotes `deckId` to NOT NULL, drops 5 legacy columns, drops `FlashcardReviewStatus` enum
- `prisma/schema.prisma` — matches the post-Migration-C state
- `scripts/backfill-flashcard-decks.ts` — pinned to its pre-Migration-C state via `@ts-nocheck` (with eslint-disable for `@typescript-eslint/ban-ts-comment`); see file header for why

**Lossy at the boundaries (documented):**
- `masteredAt` returns `null` — the legacy column captured a one-time timestamp we can't reconstruct from FSRS state. UI that surfaced "first mastered date" loses that one piece of info.
- `reviewStatus === "mastered"` is now a heuristic: state=`review` AND lapses=0 AND reps≥5. Doesn't affect scheduling, just classification in the legacy aggregate.

**Soft-delete now via `deletedAt`** on the card — Sprint 6's DELETE handler stops hard-deleting. The Sprint 1 schema added `Flashcard.deletedAt` for exactly this; switching the handler preserves the `FlashcardReviewAttempt` audit chain (FK references would otherwise break on hard delete).

### Sprint 7 — Image support on flashcards

Plan: [`../FLASHCARDS-IMAGES-PLAN.md`](../FLASHCARDS-IMAGES-PLAN.md)

Adds end-to-end image support to the flashcard editor + review surfaces so users can build image-prompt cards (identify a plant, name a face / place / building) without leaving the app.

**Three changes**:

1. **Extracted `useImagePasteHandler` hook** to `lib/domain/editor/hooks/use-image-paste.ts`. Returns `{ handlePaste, handleDrop, insertImageFromFile }`. Takes an `editorRef` (instead of editor instance) so the chicken-egg with `useEditor`'s frozen-editorProps is resolved at the call site. `MarkdownEditor.tsx` is NOT yet refactored to use this hook — that's a follow-up cleanup; it still has its in-line duplicate. The hook starts as a flashcard-only consumer; deduping later is a nice-to-have.
2. **Wired the hook into `AdaptiveFlashcardEditor`** with a hidden file input + "Image" toolbar button (rich-text mode only). Paste/drop/click-to-upload all route through the same `insertImageFromFile` pipeline that the main editor uses — placeholder image with blob URL → background upload → swap to proxied download URL → revoke blob.
3. **Image-only card layout in `CardFace`** — `isImageOnlyContent()` detects a TipTap doc whose only block is an image (with or without a paragraph wrapper); image-only faces bypass the `text-xl leading-relaxed` typography and render `<img>` centered with `max-h-full max-w-full object-contain` filling the available frame. Caption-style cards (image + text) keep the typography path.

**Plain-text mode still strips images** — by design. The toolbar button only appears in rich mode; users have to flip the "Enable rich text" toggle before they see the image-insert affordance. Auto-flip-on-paste was scoped out for v1 (would require imperative-handle plumbing from the form into the editor); documented in the plan doc as a future polish.

**`MarkdownEditor.tsx` refactor deferred** — the hook is byte-identical to MarkdownEditor's existing implementation, so the main editor could refactor to use it for free. Skipped here to keep the Sprint 7 diff focused on the flashcard surface; cleanup ticket noted.

## Verification gates (all green on this branch)

- `tsc --noEmit` exit 0 at every sprint boundary
- `eslint --max-warnings 159` holds exactly at 159 (no new warnings introduced by the epoch)
- `scripts/fsrs-scheduler-smoke.ts` — 8/8 assertions pass; caught the `learningSteps` bug pre-UI

**Pre-existing failure (not caused by this epoch)**: `pnpm collab:schema:check` fails at runtime due to a tsx + Node 25 + TipTap ESM incompatibility (`CharacterCount` → `code-block-lowlight`'s `CodeBlock.extend(...)` resolves to `undefined`). Same failure on `main`. Static-regex portion of the validator would detect `flashcardEmbed` correctly; runtime portion's failure is unrelated infrastructure debt.

## Open work (deferred to a follow-up sprint)

Sprint 6 ran Migration C on this branch via the server-side compatibility shim, NOT a full UI rewrite. The Panel + QuickAddForm still consume the legacy DTO shape; they just receive derived data now. The full FK-paradigm rewrite is genuinely deferred:

| Item | Sprint target | Notes |
|---|---|---|
| Rewrite `FlashcardsPanel.tsx` to use deck FK directly | future polish | ~900 lines of UI; no longer urgent because shim handles it |
| Rewrite `FlashcardQuickAddForm.tsx` to use `FlashcardDeckPickerDialog` instead of skill/skill-category dropdowns | future polish | Better UX (tree-shaped picker > paired dropdowns) but not required for correctness |
| Collapse `registerBlock` ↔ `getSlashCommands` dual-registry | future polish | Every new block currently needs both registrations |
| Settings sub-page UI (desiredRetention slider, default deck, Optimize button) | future polish | API + DTOs exist; just needs UI under `app/(authenticated)/settings/` |
| Playwright visual regression baselines | future polish | Block in study mode, block in reference mode, overlay 4-button row |
| FSRS optimizer actual training | v1.1 | Currently throws `OptimizerNotReadyError` until 100 reviews, then `NOT_IMPLEMENTED` |
| Card-type variants (cloze, typing, multiple-choice) | v1.1+ | `cardType` column reserved |
| Anki `.apkg` import/export | v1.2 | Round-trip semantics complex |
| Sub-card relations (Anki "siblings") | v1.2+ | Card-type variants prerequisite |
| AI-generated cards via MCP | "much later" | Explicit user out-of-scope |

## Historical note (Sprint 6 — Migration C prerequisites, NOW RESOLVED)

The original plan flagged 30+ surfaces reading legacy columns before Migration C could safely run:

| File | Legacy columns referenced |
|---|---|
| `app/api/flashcards/route.ts` | category, subcategory (on create) |
| `app/api/flashcards/[id]/route.ts` | category, subcategory, reviewStatus, masteredAt (on update) |
| `app/api/flashcards/prefill/route.ts` | category, subcategory (read) |
| `app/api/flashcards/options/route.ts` | category, subcategory (autocomplete source) |
| `app/api/flashcards/decks/route.ts` (legacy GET) | category, subcategory, reviewStatus, reviewCount, masteredCount |
| `extensions/flashcards/components/FlashcardQuickAddForm.tsx` | category, subcategory (UI inputs) |
| `extensions/flashcards/components/FlashcardsPanel.tsx` | category, subcategory, reviewStatus, reviewCount (entire 900-line panel uses string-keyed decks) |

Dropping the columns now would break: card creation, the existing Flashcards panel browse, the prefill route used by note→flashcard creation, the category autocomplete.

### Sprint 6 — "Legacy column sunset" (proposed)

Required before Migration C is safe:

1. Rewrite `FlashcardsPanel.tsx` to use the FK paradigm — call `/api/flashcards/decks/tree` instead of the legacy aggregate `GET /api/flashcards/decks`. ~900 lines of UI to migrate.
2. Rewrite `FlashcardQuickAddForm.tsx` to take a `deckId` (with the new `FlashcardDeckPickerDialog` as the selector) instead of category/subcategory strings.
3. Sunset the legacy `GET /api/flashcards/decks` aggregate route (replaced by `/decks/tree`).
4. Update `app/api/flashcards/route.ts` POST + `app/api/flashcards/[id]/route.ts` PATCH to accept `deckId` instead of category/subcategory.
5. Update `app/api/flashcards/prefill/route.ts` and `app/api/flashcards/options/route.ts` (or sunset entirely if no caller remains).
6. Then run Migration C: `ALTER TABLE Flashcard.deckId SET NOT NULL` + `DROP COLUMN category, subcategory, reviewStatus, reviewCount, masteredAt`.
7. Drop `FlashcardReviewStatus` enum (no other table references it).

### Other deferred items

| Item | Sprint target | Notes |
|---|---|---|
| Collapse `registerBlock` ↔ `getSlashCommands` dual-registry | Sprint 6 | Slash menu should read from `getAllSlashBlocks()` |
| Settings sub-page (desiredRetention slider, default deck, Optimize button) | Sprint 6 | API + DTOs exist; just needs UI under `app/(authenticated)/settings/` |
| Playwright visual regression baselines | Sprint 6 | Block in study mode, block in reference mode, overlay 4-button row |
| FSRS optimizer actual training | v1.1 | Currently `OptimizerNotReadyError` until 100 reviews; algo unimplemented |
| Card-type variants (cloze, typing, multiple-choice) | v1.1+ | `cardType` column exists; only `basic` ships |
| Anki `.apkg` import/export | v1.2 | Round-trip semantics complex |
| Filtered / dynamic decks | v1.3 | Composable on top of card query API |
| Sub-card relations (Anki "siblings") | v1.2+ | Card-type variants prerequisite |
| AI-generated cards via MCP | "much later" | Explicit user out-of-scope |

## What landed (file inventory)

**Schema + scripts**
- `prisma/schema.prisma` (deltas + learningSteps follow-up)
- `prisma/migrations/20260520120000_flashcards_fsrs_expand/migration.sql`
- `prisma/migrations/20260521090000_add_flashcard_learning_steps/migration.sql`
- `scripts/backfill-flashcard-decks.ts`
- `scripts/fsrs-scheduler-smoke.ts`

**Domain**
- `lib/domain/flashcards/fsrs/{scheduler,parameters,optimizer,types,index}.ts`
- `lib/domain/flashcards/{types,api,index}.ts` (extended)
- `lib/domain/editor/extensions/blocks/flashcard-embed.tsx` (server-safe)
- `lib/domain/editor/extensions/blocks/flashcard-embed-client.tsx`
- `lib/domain/editor/schema-version.ts` (1.7.0 → 1.8.0)
- `lib/domain/editor/extensions-{client,server}.ts` + `lib/domain/collaboration/extensions.ts` (registrations)
- `lib/domain/editor/commands/slash-commands.tsx` (slash entry)

**API**
- `app/api/flashcards/decks/route.ts` (added POST)
- `app/api/flashcards/decks/tree/route.ts`
- `app/api/flashcards/decks/[id]/route.ts`
- `app/api/flashcards/queue/route.ts`
- `app/api/flashcards/review/route.ts`
- `app/api/flashcards/stats/route.ts`
- `app/api/flashcards/parameters/route.ts`
- `app/api/flashcards/parameters/optimize/route.ts`

**UI**
- `extensions/flashcards/components/FlashcardReviewOverlay.tsx` (4-button refactor)
- `extensions/flashcards/components/FlashcardEmbedNodeView.tsx` (NEW)
- `extensions/flashcards/components/FlashcardDeckPickerDialog.tsx` (NEW)
- `extensions/flashcards/settings/FlashcardsSettingsDialog.tsx` (narrowed `FlashcardSettingsReviewMode`)

## Plan document

[`../FLASHCARDS-FSRS-PLAN.md`](../FLASHCARDS-FSRS-PLAN.md) — the design doc that drove this epoch. The schema deltas, FSRS algorithm choice, deck-as-sidecar decision, and 5-session breakdown all match. Sprint 6 / "legacy column sunset" is the cleanly-deferred portion.
