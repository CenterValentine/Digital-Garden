---
title: Flashcards FSRS + Editor Block Plan
status: shipped_in_branch (Sprints 1–5; Migration C deferred to Sprint 6)
last_updated: 2026-05-21
owner: centervalentine
branch: epoch-19/sprint-1-flashcards-schema
epoch_tracker: epochs/epoch-19-flashcards-fsrs.md
related:
  - extensions/flashcards/
  - prisma/schema.prisma
  - lib/domain/editor/extensions/blocks/
  - lib/domain/collaboration/extensions.ts
---

> **Status (2026-05-21):** Sprints 1–5 shipped on `epoch-19/sprint-1-flashcards-schema`.
> Migration C (drop legacy `category`/`subcategory`/`reviewStatus`/`reviewCount`/`masteredAt`
> columns) is deferred to **Sprint 6 — Legacy column sunset** because `FlashcardsPanel`,
> `FlashcardQuickAddForm`, and 5 legacy API routes still read those columns. See
> [`epochs/epoch-19-flashcards-fsrs.md`](epochs/epoch-19-flashcards-fsrs.md) §"Open work"
> for the exact prerequisite checklist before Migration C is safe to run.

# Flashcards FSRS + Editor Block Plan

Two coupled upgrades to the `flashcards` extension:

1. Replace the binary `review|mastered` outcome model with **Anki-grade spaced repetition** using the FSRS algorithm (Free Spaced Repetition Scheduler) via `ts-fsrs`. Cards resurface at progressively longer intervals tuned to the point of weakest memory, with per-user parameter optimization.
2. Add a new TipTap block `flashcardEmbed` that lets users embed a deck or a card-list inline in any note, with in-block flip-through and a "Play" portal that reuses the existing `FlashcardReviewOverlay`.

Flashcards remain global. A block embed is a reference (deckId / cardIds), not a payload. Deleting a note never deletes the cards or decks it references — current `sourceContentId onDelete: SetNull` already enforces this.

## Goals

- 4-button rating UI (Again / Hard / Good / Easy) feeding FSRS scheduling.
- Per-user tunable FSRS parameters with `desiredRetention` setting (default 0.9).
- First-class **deck** entity in a sidecar `FlashcardDeck` table, nested Anki-style via `parentDeckId` + materialized `path`.
- Editor block embedding a deck or a card subset, with inline preview and a Play portal.
- "Study mode" vs "Reference mode" toggle on each block so users can skim without polluting their schedule.
- Future-proof column shape (`cardType`) so v1.x can layer cloze / typing / multiple-choice card variants without another migration.

## Non-goals (v1)

- Card-type variants beyond `basic` (cloze, typing, choice, ordering, image-occlusion).
- Anki `.apkg` import/export.
- Filtered / dynamic decks ("review just my last-week lapses").
- Per-deck retention or parameter overrides.
- AI-generated cards via MCP (explicit user note: much later sprint).
- Mobile React Native shell bridge messages for flashcards (waits on Phase 6 of the Garden Companion plan).

## Algorithm choice

FSRS via [`ts-fsrs`](https://github.com/open-spaced-repetition/ts-fsrs) (MIT, actively maintained, the same algorithm shipped in Anki 23.10+).

Why FSRS over SM-2:
- Models stability and difficulty separately — more accurate at "shown right when weakest" than SM-2's single ease factor.
- Per-user weight optimizer retunes from real review history; gets more accurate the longer you use it.
- Compatible 4-button rating UI; users see the same Again/Hard/Good/Easy as Anki.
- No need to ship SM-2 first; ts-fsrs is small and well-typed.

## Schema changes

All changes in [`prisma/schema.prisma`](../../prisma/schema.prisma). Required because today's `category`/`subcategory` strings + binary outcome cannot represent decks, FSRS state, or 4-button ratings.

### New enums

```prisma
enum FlashcardState {
  new
  learning
  review
  relearning
  suspended
  archived
}

enum FlashcardRating {
  again
  hard
  good
  easy
}

enum FlashcardCardType {
  basic
  // future: cloze, typing, choice, ordering
}
```

### New model: FlashcardDeck

```prisma
model FlashcardDeck {
  id            String         @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  ownerId       String         @db.Uuid
  parentDeckId  String?        @db.Uuid
  name          String         @db.VarChar(120)
  slug          String         @db.VarChar(140)
  path          String         @db.VarChar(500)
  description   String?        @db.VarChar(500)
  displayOrder  Int            @default(0)
  iconName      String?        @db.VarChar(60)
  iconColor     String?        @db.VarChar(20)
  createdAt     DateTime       @default(now()) @db.Timestamptz(6)
  updatedAt     DateTime       @updatedAt @db.Timestamptz(6)
  deletedAt     DateTime?      @db.Timestamptz(6)

  owner         User           @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  parent        FlashcardDeck? @relation("DeckHierarchy", fields: [parentDeckId], references: [id], onDelete: SetNull)
  children      FlashcardDeck[] @relation("DeckHierarchy")
  flashcards    Flashcard[]

  @@unique([ownerId, slug])
  @@unique([ownerId, parentDeckId, name])
  @@index([ownerId, deletedAt])
  @@index([ownerId, path])
  @@index([parentDeckId, displayOrder])
}
```

`path` is the materialized form of the deck hierarchy (`"spanish/verbs/irregular"`). Kept in sync via a Prisma middleware hook in `lib/domain/flashcards/decks/path.ts` whenever `name` or `parentDeckId` changes. Redundant with `parentDeckId` but lets the deck picker query descendants cheaply via `LIKE 'spanish/%'`.

### Flashcard model changes

Add (FSRS state, deck FK, future-proofing):

```prisma
model Flashcard {
  // existing columns unchanged...
  deckId          String                @db.Uuid                       // NEW, required after backfill
  cardType        FlashcardCardType     @default(basic)                // NEW

  // FSRS state (NEW)
  state           FlashcardState        @default(new)
  due             DateTime              @default(now()) @db.Timestamptz(6)
  stability       Float                 @default(0)
  difficulty      Float                 @default(0)
  elapsedDays     Float                 @default(0)
  scheduledDays   Float                 @default(0)
  reps            Int                   @default(0)
  lapses          Int                   @default(0)
  lastReviewedAt  DateTime?             @db.Timestamptz(6)
  suspendedAt     DateTime?             @db.Timestamptz(6)
  archivedAt      DateTime?             @db.Timestamptz(6)
  deletedAt       DateTime?             @db.Timestamptz(6)             // NEW soft-delete

  deck            FlashcardDeck         @relation(fields: [deckId], references: [id], onDelete: Restrict)

  @@index([ownerId, deckId])
  @@index([ownerId, due])
  @@index([ownerId, state, due])
  @@index([ownerId, deletedAt])
}
```

Drop in a follow-up migration (see Migration Order below): `category`, `subcategory`, `reviewStatus`, `reviewCount`, `masteredAt`. Replaced by `deckId` + FSRS state + `archivedAt`.

`onDelete: Restrict` on `deckId` is deliberate — deleting a deck cannot orphan cards. Deck soft-delete handles the UX case; hard-delete requires moving cards first.

### FlashcardReviewAttempt model changes

```prisma
model FlashcardReviewAttempt {
  // existing columns unchanged...
  rating              FlashcardRating?     // NEW; null for reference-mode skims
  reviewMode          String               @db.VarChar(20)  // expand to text: front_to_back | back_to_front | random | reference

  // FSRS audit (NEW)
  stateBefore         FlashcardState?
  stateAfter          FlashcardState?
  previousDue         DateTime?            @db.Timestamptz(6)
  scheduledDue        DateTime?            @db.Timestamptz(6)
  previousStability   Float?
  newStability        Float?
  previousDifficulty  Float?
  newDifficulty       Float?

  @@index([ownerId, rating, createdAt])  // for FSRS optimizer queries
}
```

`outcome` is **kept** for back-compat with existing rows (it becomes derivable from rating: `again|hard → review`, `good|easy → mastered` if state reaches `review`). New writes populate both during a transition window, then `outcome` can be dropped later.

`reviewMode` widens from enum to varchar to accommodate the new `reference` value without burning an enum migration. Alternative: extend the existing enum — judgment call.

### User model changes

```prisma
model User {
  // existing columns unchanged...
  fsrsParameters    Json    @default("{}")
  desiredRetention  Float   @default(0.9)
  fsrsMaxInterval   Int     @default(36500)   // 100 years; Anki default
  defaultFlashcardDeckId  String?  @db.Uuid    // optional convenience
}
```

`fsrsParameters` stores the 19-weight FSRS array as JSON. Empty object means "use library defaults." Populated by the optimizer after the user has ~100+ reviews.

## Migration order (critical)

This is an **expand → migrate → contract** sequence. Three migrations, not one. Each separately deployable; production safe.

### Migration A: Expand (additive, zero downtime)

1. Create `FlashcardDeck` table.
2. Create new enums (`FlashcardState`, `FlashcardRating`, `FlashcardCardType`).
3. Add new columns to `Flashcard`: `deckId` (nullable initially), `cardType`, all FSRS columns, `suspendedAt`, `archivedAt`, `deletedAt`.
4. Add new columns to `User`: `fsrsParameters`, `desiredRetention`, `fsrsMaxInterval`, `defaultFlashcardDeckId`.
5. Add new columns to `FlashcardReviewAttempt` (all FSRS audit columns + `rating`).
6. Widen `reviewMode` from enum to varchar.

Existing rows continue to validate because every new column has a default. Application can be redeployed before backfill runs.

### Migration B: Backfill (data-only, runnable as a script)

Single script at `scripts/backfill-flashcard-decks.ts`. Idempotent; safe to re-run. Wrapped in a transaction per owner.

```sql
-- Per owner, insert root decks from distinct categories
INSERT INTO "FlashcardDeck" (id, "ownerId", name, slug, path, "createdAt", "updatedAt")
SELECT gen_random_uuid(), "ownerId", category, slugify(category), lower(slugify(category)), now(), now()
FROM (SELECT DISTINCT "ownerId", category FROM "Flashcard" WHERE category <> '') t
ON CONFLICT ("ownerId", slug) DO NOTHING;

-- Insert child decks where subcategory exists
INSERT INTO "FlashcardDeck" (id, "ownerId", name, slug, path, "parentDeckId", "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  f."ownerId",
  f.subcategory,
  slugify(f.category || '-' || f.subcategory),
  lower(slugify(f.category) || '/' || slugify(f.subcategory)),
  parent.id,
  now(), now()
FROM (SELECT DISTINCT "ownerId", category, subcategory FROM "Flashcard" WHERE subcategory <> '') f
JOIN "FlashcardDeck" parent
  ON parent."ownerId" = f."ownerId" AND parent.slug = slugify(f.category)
ON CONFLICT ("ownerId", slug) DO NOTHING;

-- Update Flashcard.deckId to point at the leaf
UPDATE "Flashcard" f
SET "deckId" = (
  SELECT d.id FROM "FlashcardDeck" d
  WHERE d."ownerId" = f."ownerId"
    AND d.path = lower(slugify(f.category) || CASE WHEN f.subcategory <> '' THEN '/' || slugify(f.subcategory) ELSE '' END)
  LIMIT 1
)
WHERE f."deckId" IS NULL;

-- For any cards with empty category, create a per-user "Inbox" deck
INSERT INTO "FlashcardDeck" (id, "ownerId", name, slug, path, "createdAt", "updatedAt")
SELECT DISTINCT gen_random_uuid(), "ownerId", 'Inbox', 'inbox', 'inbox', now(), now()
FROM "Flashcard"
WHERE "deckId" IS NULL
ON CONFLICT ("ownerId", slug) DO NOTHING;

UPDATE "Flashcard" f
SET "deckId" = (SELECT id FROM "FlashcardDeck" WHERE "ownerId" = f."ownerId" AND slug = 'inbox' LIMIT 1)
WHERE f."deckId" IS NULL;
```

Verification queries the script must run after the writes:
- `SELECT COUNT(*) FROM "Flashcard" WHERE "deckId" IS NULL;` → must be 0
- `SELECT COUNT(*) FROM "FlashcardDeck"` → reasonable count, no NULL paths
- Sample 10 random `(card.id, deck.path)` joins and verify the deck name matches the old `category/subcategory`

### Migration C: Contract (destructive, after one green deploy)

After Migration B has run cleanly in production and the application no longer reads `category`/`subcategory`/`reviewStatus`/`reviewCount`/`masteredAt`:

1. `ALTER TABLE "Flashcard" ALTER COLUMN "deckId" SET NOT NULL;`
2. Drop columns: `category`, `subcategory`, `reviewStatus`, `reviewCount`, `masteredAt`.
3. Drop unused enum: `FlashcardReviewStatus` (only if no other table references it).
4. Optionally drop `outcome` from `FlashcardReviewAttempt` after a longer migration window.

**Rule of thumb:** never combine backfill and destructive drop in one migration. If the backfill is wrong, you want the old columns to roll back to.

## FSRS integration

New module: [`lib/domain/flashcards/fsrs/`](../../lib/domain/flashcards/fsrs/) (to create).

```
lib/domain/flashcards/fsrs/
├── scheduler.ts      # wraps ts-fsrs FSRS class
├── parameters.ts     # default + per-user resolution
├── optimizer.ts      # opt-in retraining; reads review history
├── types.ts          # shared shapes
└── index.ts          # barrel
```

`scheduler.ts` API:

```ts
export type ScheduleInput = {
  card: Pick<Flashcard, "state" | "due" | "stability" | "difficulty" | "elapsedDays" | "scheduledDays" | "reps" | "lapses" | "lastReviewedAt">;
  rating: FlashcardRating;
  now: Date;
  parameters: FSRSParameters;
};

export type ScheduleResult = {
  next: Pick<Flashcard, "state" | "due" | "stability" | "difficulty" | "elapsedDays" | "scheduledDays" | "reps" | "lapses" | "lastReviewedAt">;
  log: {
    previousDue: Date | null;
    scheduledDue: Date;
    previousStability: number;
    newStability: number;
    previousDifficulty: number;
    newDifficulty: number;
  };
};

export function scheduleReview(input: ScheduleInput): ScheduleResult;

export function previewIntervals(
  card: ScheduleInput["card"],
  parameters: FSRSParameters,
  now: Date,
): Record<FlashcardRating, { dueAt: Date; intervalDays: number }>;
```

`previewIntervals` powers the "next interval" labels under each rating button in the overlay — Anki shows these too, and they make spaced repetition feel less opaque.

`optimizer.ts` is opt-in: the user clicks "Optimize parameters" in settings, the server reads their `FlashcardReviewAttempt` history (last 1000 attempts), runs ts-fsrs `Optimizer`, and writes the result back to `User.fsrsParameters`. Eventually this can run on a nightly cron, but v1 is on-demand.

## API surface

New routes under `app/api/flashcards/`:

```
GET    /api/flashcards/decks                 # tree-shaped: { id, name, path, parentDeckId, childCount, dueCount, ... }
POST   /api/flashcards/decks                 # { name, parentDeckId?, description? }
PATCH  /api/flashcards/decks/[id]            # rename, reparent, icon, description
DELETE /api/flashcards/decks/[id]            # soft-delete; query param ?cascade=true to delete cards too

GET    /api/flashcards/cards                 # filters: deckId, deckIds[], state, dueBefore, limit
POST   /api/flashcards/cards                 # { deckId, frontContent, backContent, sourceContentId? }
PATCH  /api/flashcards/cards/[id]            # edit content / move deck
DELETE /api/flashcards/cards/[id]            # soft-delete (sets deletedAt)
POST   /api/flashcards/cards/[id]/suspend
POST   /api/flashcards/cards/[id]/unsuspend
POST   /api/flashcards/cards/[id]/archive
POST   /api/flashcards/cards/[id]/unarchive

GET    /api/flashcards/queue                 # due now; params: deckId?, cardIds?, includeNew=true, limit
POST   /api/flashcards/review                # { cardId, rating, reviewMode, shownSide, responseTimeMs? }
                                             # response: { card: <updated>, log: <FSRS audit>, nextCardId?: string }

GET    /api/flashcards/stats                 # { perDeck: { id, due, new, learning, review, lapses }, global: { ... } }
POST   /api/flashcards/parameters/optimize   # async kickoff; returns { jobId } (or sync if review history < 1000)
GET    /api/flashcards/parameters            # current effective parameters + last-optimized-at
```

Type definitions go in [`extensions/flashcards/server/types.ts`](../../extensions/flashcards/server/) (does not yet exist — create alongside route handlers).

Reference-mode skims hit the same `/review` endpoint with `reviewMode: "reference"` and **no** `rating` — the handler logs the attempt with NULL rating and does **not** call the scheduler. The card's `due`/`state` are untouched.

## Editor block: `flashcardEmbed`

New TipTap extension: `lib/domain/editor/extensions/blocks/flashcard-embed.tsx`.

### Node spec

```ts
export const FlashcardEmbed = Node.create({
  name: "flashcardEmbed",
  group: "block",
  atom: false,
  selectable: true,
  draggable: true,
  addAttributes: () => ({
    deckId:      { default: null },
    cardIds:     { default: null },     // string[] | null
    defaultMode: { default: "study" },  // "study" | "reference"
    showRatingButtons: { default: true },
  }),
  parseHTML: () => [{ tag: "div[data-block='flashcard-embed']" }],
  renderHTML: ({ HTMLAttributes }) =>
    ["div", { "data-block": "flashcard-embed", ...HTMLAttributes }, 0],
  addNodeView: () => ReactNodeViewRenderer(FlashcardEmbedNodeView),
});
```

Plus `ServerFlashcardEmbed` (same attrs, identical `renderHTML`, no NodeView) in the same file. Both registered:
- `getEditorExtensions()` → `FlashcardEmbed` ([lib/domain/editor/extensions-client.ts](../../lib/domain/editor/extensions-client.ts))
- `getServerExtensions()` → `ServerFlashcardEmbed` ([lib/domain/editor/extensions-server.ts](../../lib/domain/editor/extensions-server.ts))
- `getCollaborationServerExtensions()` → `ServerFlashcardEmbed` ([lib/domain/collaboration/extensions.ts](../../lib/domain/collaboration/extensions.ts))
- Bump `TIPTAP_SCHEMA_VERSION` minor in [lib/domain/editor/schema-version.ts](../../lib/domain/editor/schema-version.ts) (new node, additive — no migration needed in [migrations.ts](../../lib/domain/export/migrations.ts)).

### NodeView UI (FlashcardEmbedNodeView)

Located in [`extensions/flashcards/components/FlashcardEmbedNodeView.tsx`](../../extensions/flashcards/components/) (new file). Renders:

1. **Header strip:** deck name (or "5 cards" if cardIds), due-today count badge, deck-icon, mode pill toggle (`🎯 Study` / `👁 Reference`).
2. **Card area:** flip-through carousel. Uses existing card-flip animation from `FlashcardReviewOverlay`. Arrow keys / swipe to advance.
3. **Rating row** (only when `mode === "study"` and `showRatingButtons === true`): 4 buttons with predicted intervals.
4. **Footer actions:** `▶ Play` (opens overlay portal with `{ deckId, cardIds }` filter), `+ Add card` (opens `FlashcardQuickAddDialog` with deck pre-filled), `⋯` menu (edit reference, convert to deck embed, remove block).

Broken references (deck deleted, all cards deleted) render an unsupported-block placeholder with `Reattach` / `Remove` actions — same pattern as broken wiki-links.

### Slash command

Add `/flashcards` to [`lib/domain/editor/commands/slash-commands.tsx`](../../lib/domain/editor/commands/slash-commands.tsx):

- `/flashcards` → opens deck-picker dialog (existing decks + "New deck…")
- `/flashcards <query>` → fuzzy-match decks by name; first match selected on Enter
- `/flashcard-new` → quick path: creates a new deck (prompts for name) and inserts an empty embed pointing at it

### Collab semantics

The block stores only `{ deckId, cardIds, defaultMode, showRatingButtons }` as attrs. Card content lives in the global `Flashcard` rows, not in the Y.Doc. So collaborative editing on a flashcard block is trivial — last-write-wins on the attribute set, no sub-document needed. The NodeView re-fetches card data from the API on attribute change.

This is intentionally different from `excalidrawBlock` / `mermaidBlock`, which carry their content inside Y sub-maps.

## Overlay refactor

[`extensions/flashcards/components/FlashcardReviewOverlay.tsx`](../../extensions/flashcards/components/FlashcardReviewOverlay.tsx):

- Replace the existing two-button "review/mastered" outcome bar with a 4-button rating row (`Again` / `Hard` / `Good` / `Easy`). Each button shows the predicted next-due interval underneath ("10m" / "2d" / "5d" / "12d"), sourced from `previewIntervals()`.
- Add optional `filter` prop: `{ deckId?: string; cardIds?: string[] }`. When present, the queue fetch sends those parameters.
- Keyboard: `1`/`2`/`3`/`4` map to ratings; `space` flips the card; `Esc` closes.
- Header shows current deck path ("Spanish / Verbs / Irregular") when filtered.
- Empty state: "No cards due in this deck. Next card due in 4h." (queries `GET /api/flashcards/queue?nextDueOnly=true`).

The flip animation, the card layout, and the "shown side" tracking all stay as-is.

## Settings additions

Add a "Flashcards" sub-page to settings ([`app/(authenticated)/settings/`](../../app/(authenticated)/settings/)):

- **Desired retention** — slider 0.7 → 0.97, default 0.9. Tooltip explains: "Target probability of recalling a card on its due date. Higher = more reviews, fewer forgotten cards. 0.9 is Anki's default."
- **Default deck** — dropdown for `User.defaultFlashcardDeckId` (used as fallback when creating cards without an explicit deck).
- **Inline mode default** — "Study" or "Reference". Controls what `FlashcardEmbed.defaultMode` is set to at insert time.
- **Show predicted intervals on rating buttons** — boolean.
- **Optimize parameters button** — disabled until user has ≥ 100 reviews. Shows last-optimized timestamp and review count used. Clicking runs `POST /api/flashcards/parameters/optimize`.

Follows the existing settings pattern (Glass-0 cards, `PATCH /api/user/settings`, sonner toast).

## Browse / panel updates

[`extensions/flashcards/components/FlashcardsPanel.tsx`](../../extensions/flashcards/components/FlashcardsPanel.tsx):

- Tree view of decks (uses `react-arborist`, same as file tree). Each row shows deck name + due-count badge.
- Right pane: card list filtered to selected deck (or "All due today" when no deck selected).
- Card row shows: front text, deck path, state, due date, last reviewed.
- Bulk actions: move cards to another deck, suspend, archive.
- "Review" button on each deck row launches the overlay with that deck pre-filtered.

[`extensions/flashcards/components/FlashcardQuickAddDialog.tsx`](../../extensions/flashcards/components/FlashcardQuickAddDialog.tsx):
- Add deck selector (defaults to user's `defaultFlashcardDeckId`, or "Inbox" if unset).
- "Create new deck" inline action.

## Quality gates

- `pnpm typecheck` — clean; new types in `lib/domain/flashcards/fsrs/types.ts` and `extensions/flashcards/server/types.ts`.
- `pnpm lint` — zero new warnings against the `--max-warnings 175` ratchet.
- `pnpm collab:schema:check` — passes because `FlashcardEmbed` + `ServerFlashcardEmbed` are wired into `getCollaborationServerExtensions()`.
- `pnpm build` — green, including the schema check.
- **New CI gate (optional):** `pnpm flashcards:fsrs:check` — quick scheduler smoke test. Creates 10 in-memory cards, simulates 100 "Good" reviews, asserts intervals are monotonically increasing. Catches a broken scheduler import without spinning up the DB.
- Playwright visual regressions in [`tests/e2e/extensions/`](../../tests/e2e/extensions/):
  - `flashcard-block-study.spec.ts` — block in study mode, rating buttons visible
  - `flashcard-block-reference.spec.ts` — block in reference mode, no rating buttons
  - `flashcard-overlay-rating.spec.ts` — overlay with 4-button rating + predicted intervals

## Session breakdown

Five sessions, roughly half-day each. Session 1 is the heaviest because it's the schema work; sessions 2–4 are parallelizable in theory but probably not worth it for a solo dev.

### Session 1 — Schema + backfill

- Write the Prisma migration A (additive).
- Write `scripts/backfill-flashcard-decks.ts` (Migration B as a runnable script, not a Prisma migration).
- Run locally: backfill on seeded dev DB, eyeball the result via `npx prisma studio`.
- Generate Prisma client.
- Smoke-test: ensure existing `FlashcardsPanel` still loads (it'll read NULL `deckId` cards until backfill runs).
- **Do not yet** alter `deckId` to NOT NULL or drop legacy columns — those are Migration C, after the app is updated.

### Session 2 — FSRS module + new API routes

- `pnpm add ts-fsrs`.
- Build `lib/domain/flashcards/fsrs/` (scheduler, parameters, optimizer stub).
- Build deck CRUD routes (`/api/flashcards/decks*`).
- Build card CRUD routes including `/queue`, `/review`, `/stats`.
- Add `/parameters` and `/parameters/optimize` (sync impl for now; async/job-queue later).
- Unit tests for scheduler edge cases: new card → learning, learning → review (Good), review → relearning (Again), suspended bypass.

### Session 3 — Overlay refactor

- Replace 2-button outcome with 4-button rating.
- Plumb `filter` prop.
- Show predicted intervals via `previewIntervals()`.
- Keyboard shortcuts (1/2/3/4 + space + Esc).
- Visual regression baselines.
- Manual smoke test in browser.

### Session 4 — Editor block

- Create `FlashcardEmbed` + `ServerFlashcardEmbed` in `lib/domain/editor/extensions/blocks/flashcard-embed.tsx`.
- Register in all four extension sets + collab schema.
- Bump `TIPTAP_SCHEMA_VERSION`.
- Build `FlashcardEmbedNodeView` in `extensions/flashcards/components/`.
- Add `/flashcards` slash command and deck-picker dialog.
- Visual regression baselines for both modes.
- Verify `pnpm collab:schema:check` green.

### Session 5 — Browse + settings + polish + Migration C

- Update `FlashcardsPanel` to tree-shaped deck browser.
- Update `FlashcardQuickAddDialog` with deck selector.
- Build settings sub-page.
- Run Migration C (drop legacy columns) after confirming nothing else reads them — `grep -r "category\|subcategory\|reviewStatus\|masteredAt" extensions/flashcards/ lib/domain/flashcards/ app/api/flashcards/` should return zero matches in source (only in migration files).
- Update [`docs/notes-feature/STATUS.md`](../STATUS.md), [`BACKLOG.md`](./BACKLOG.md), add `epochs/epoch-19-flashcards-fsrs.md`.
- Write a short user-facing changelog entry.

## Risks

- **Migration B failure mid-flight** — backfill script must be idempotent (`ON CONFLICT DO NOTHING`, NULL-check before update). If interrupted, re-running picks up where it left off. Wrap in per-owner transactions, not one giant transaction.
- **FSRS cold start** — until the user has ~100 reviews, predicted intervals are based on default parameters. Defaults are well-tuned (Anki community baseline) so this is "good enough" but not optimal. Optimizer button is opt-in to avoid surprising users.
- **Inline study-mode surprise** — users may flip cards inline out of curiosity and accidentally rate them. Mitigation: the mode pill is prominent; "Reference mode" is also the default for new blocks if the user opts in via settings. Future enhancement (out of scope): a "first-flip" toast that asks "are you studying or just looking?" once per session.
- **Collab on flashcardEmbed** — attribute-only Y.Doc state is safe. The risk is two users editing the deck simultaneously through the API while a block is mounted; the block re-fetches on attribute changes, but card-content changes don't propagate via Y.Doc. Acceptable for v1; document the constraint.
- **`reviewMode` enum → varchar** — this is the rare "schema flexibility wins" call. If you'd rather extend the enum, the migration is one extra line; not a blocker either way.
- **Drop-column timing** — Migration C must wait until **all** running app instances have been redeployed against Migration A's schema. On Vercel, this means after the next prod deploy completes successfully. Don't ship A and C in the same PR.

## Deferred items (v1.x and beyond)

| Item | Why deferred | Earliest target |
|---|---|---|
| Card-type variants (cloze, typing, multiple-choice, ordering) | `cardType` column ready; UI + scheduling logic substantial | v1.1 |
| Anki `.apkg` import/export | Round-trip semantics complex; not blocking core UX | v1.2 |
| Filtered / dynamic decks | Composable on top of card query API | v1.3 |
| Sibling cards (one note → many cards) | Card-type variants prerequisite | v1.2+ |
| Per-deck retention overrides | Per-user retention covers 95% of use; deck override is power-user | v1.3 |
| Mobile bridge messages | Waits on React Native shell (Garden Companion Phase 6) | post-mobile |
| AI-generated cards via MCP | User explicitly out of scope; needs MCP infra first | "much later" |
| Nightly FSRS parameter optimization cron | Manual optimize button covers v1 | when daily-load justifies it |

## Open follow-up before implementation kicks off

- Decide whether to retain `outcome` on `FlashcardReviewAttempt` permanently or sunset it after `rating` covers all rows for, say, 60 days. Recommendation: sunset.
- Confirm the slash-command UX for the deck picker matches the wiki-link / person-mention suggestion style.
- Confirm Migration C is run **separately** in production (separate PR, separate deploy), not chained to A.
