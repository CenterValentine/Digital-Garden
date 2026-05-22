import type { Prisma } from "@/lib/database/generated/prisma";
import { prisma as defaultPrisma } from "@/lib/database/client";
import { slugifyDeckName } from "./api";
import type {
  FlashcardReviewStatus,
  FlashcardState,
} from "./types";

// Compatibility helpers (Epoch 19, Sprint 6 — Legacy column sunset).
//
// The legacy flashcards UI (FlashcardsPanel, FlashcardQuickAddForm) +
// the original API surface used category/subcategory strings to bucket
// cards. Migration C drops those columns. This file is the shim that
// lets the unchanged UI keep working: legacy DTOs are derived from the
// FK paradigm (FlashcardDeck) at the server boundary, and legacy
// request payloads (`{ category, subcategory }`) are translated to
// deckId lookups before they hit Prisma.
//
// All helpers are server-only — they import Prisma directly.

// ─── DTO derivation (read path) ──────────────────────────────────

// Deck shape returned by the queries below — minimal subset needed
// to compute the legacy strings.
export interface LegacyDeckSource {
  name: string;
  parentDeckId: string | null;
  parent: { name: string } | null;
}

// Derive the legacy { category, subcategory } pair from a deck.
//   Root deck (no parent):   category = deck.name, subcategory = ""
//   Child deck (has parent): category = parent.name, subcategory = deck.name
//
// Two-level only — matches the original schema's two-string bucketing.
// Decks deeper than two levels still classify as `category = root, subcategory = leaf.name`
// (we use the leaf's parent for the subcategory string; deeper structure
// is lost in the legacy shape but preserved in the FK paradigm).
export function deriveLegacyCategoryAndSubcategory(
  deck: LegacyDeckSource | null,
): { category: string; subcategory: string } {
  if (!deck) return { category: "General", subcategory: "" };
  if (deck.parent) {
    return { category: deck.parent.name, subcategory: deck.name };
  }
  return { category: deck.name, subcategory: "" };
}

// Translate the FSRS state to the legacy 4-value status.
// "mastered" is no longer a discrete state — we synthesize it from
// state=review + lapses=0 + reps>=N as a heuristic. Anyone who cares
// about the legacy "mastered" filter gets a reasonable answer.
export function deriveLegacyReviewStatus(
  state: FlashcardState,
  reps: number,
  lapses: number,
): FlashcardReviewStatus {
  switch (state) {
    case "archived":
      return "archived";
    case "new":
      return "new";
    case "review":
      // Heuristic: 5+ successful reps with zero lapses qualifies as
      // "mastered" in the legacy UI's sense. Doesn't affect scheduling.
      return reps >= 5 && lapses === 0 ? "mastered" : "review";
    case "learning":
    case "relearning":
    case "suspended":
      return "review";
  }
}

// ─── Deck resolution (write path) ────────────────────────────────

// Look-up-or-create the deck implied by a legacy { category, subcategory }
// pair. Idempotent — multiple calls with the same strings hit the same
// rows. Used by:
//   - POST /api/flashcards         (card create with legacy shape)
//   - PATCH /api/flashcards/[id]   (card move via category/subcategory)
//   - PATCH /api/flashcards/decks  (legacy deck-rename action)
//
// Matches scripts/backfill-flashcard-decks.ts's slug rules so calls
// from either side land on the same deck.
export async function resolveLegacyDeckId(
  ownerId: string,
  rawCategory: string,
  rawSubcategory: string,
  client: Prisma.TransactionClient | typeof defaultPrisma = defaultPrisma,
): Promise<string> {
  const category = rawCategory.trim() || "General";
  const subcategory = rawSubcategory.trim();

  // Root deck for the category.
  const rootSlug = slugifyDeckName(category);
  const rootPath = rootSlug;
  let root = await client.flashcardDeck.findUnique({
    where: { ownerId_slug: { ownerId, slug: rootSlug } },
    select: { id: true, path: true },
  });
  if (!root) {
    root = await client.flashcardDeck.create({
      data: {
        ownerId,
        name: category,
        slug: rootSlug,
        path: rootPath,
      },
      select: { id: true, path: true },
    });
  }

  if (!subcategory) return root.id;

  // Child deck for the subcategory under the root.
  const childSlug = slugifyDeckName(`${category}-${subcategory}`);
  const childPath = `${root.path}/${slugifyDeckName(subcategory)}`;
  const child = await client.flashcardDeck.findUnique({
    where: { ownerId_slug: { ownerId, slug: childSlug } },
    select: { id: true },
  });
  if (child) return child.id;

  const created = await client.flashcardDeck.create({
    data: {
      ownerId,
      parentDeckId: root.id,
      name: subcategory,
      slug: childSlug,
      path: childPath,
    },
    select: { id: true },
  });
  return created.id;
}

// Translate a legacy reviewStatus PATCH into a (state, archivedAt,
// suspendedAt) tuple. Only "archived" and "new" are actually settable
// from outside FSRS — "review" and "mastered" are derived from the
// scheduler. The latter two are no-ops here.
export function deriveStateFromLegacyStatus(
  status: FlashcardReviewStatus,
  now: Date,
): { state?: FlashcardState; archivedAt?: Date | null; suspendedAt?: Date | null } {
  switch (status) {
    case "archived":
      return { state: "archived", archivedAt: now };
    case "new":
      // Un-archive / un-suspend → back to new (resets FSRS scheduling).
      return { state: "new", archivedAt: null, suspendedAt: null };
    case "review":
    case "mastered":
      // No-op — FSRS state is scheduler-controlled. Caller may still
      // want to apply other changes; just don't touch state.
      return {};
  }
}
