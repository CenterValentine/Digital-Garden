---
epoch: 19
title: Flashcards FSRS — Anki-Grade Spaced Repetition + Editor Block
status: shipped_in_branch
started: 2026-05-20
completed: 2026-05-21
last_updated: 2026-05-21
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

This sprint.

- `FlashcardDeckPickerDialog` — portal-mounted modal with tree view, search, and inline "Create new deck" form. Used by `FlashcardEmbedNodeView`'s no-deck state.
- Wired the dialog into the block; the previously-scaffolded `updateAttrs()` helper persists `{ deckId }` to the node when the user picks.
- This epoch tracker; plan doc closeout.
- **Migration C deferred** — see "Open work" below.

## Verification gates (all green on this branch)

- `tsc --noEmit` exit 0 at every sprint boundary
- `eslint --max-warnings 159` holds exactly at 159 (no new warnings introduced by the epoch)
- `scripts/fsrs-scheduler-smoke.ts` — 8/8 assertions pass; caught the `learningSteps` bug pre-UI

**Pre-existing failure (not caused by this epoch)**: `pnpm collab:schema:check` fails at runtime due to a tsx + Node 25 + TipTap ESM incompatibility (`CharacterCount` → `code-block-lowlight`'s `CodeBlock.extend(...)` resolves to `undefined`). Same failure on `main`. Static-regex portion of the validator would detect `flashcardEmbed` correctly; runtime portion's failure is unrelated infrastructure debt.

## Open work (deferred from Sprint 5)

The plan called for Migration C (drop legacy columns) in Sprint 5. Grep across the worktree showed Migration C is **load-bearing blocked** — these surfaces still read or write the legacy columns:

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
