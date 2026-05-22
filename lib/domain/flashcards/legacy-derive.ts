import type {
  FlashcardReviewStatus,
  FlashcardState,
} from "./types";

// Client-safe legacy-shape derivation helpers (Epoch 19, Sprint 6).
//
// CRITICAL: this file is imported transitively through the barrel
// (lib/domain/flashcards/index.ts) by client components like
// FlashcardReviewOverlay. It MUST stay free of any Prisma value imports
// — the type-only imports of FlashcardReviewStatus / FlashcardState
// are fine because they erase at compile time, but a `value` import
// of `Prisma` or `prisma` would drag the pg driver into the client
// bundle and break the build with `Module not found: dns/net/tls/fs`.
//
// Server-only helpers (resolveLegacyDeckId, etc.) live in the sibling
// legacy-compat.ts and are NOT re-exported through the barrel — server
// callers import them via the deep path
// `@/lib/domain/flashcards/legacy-compat`.

// ─── Read-path derivation ────────────────────────────────────────

// Deck shape returned by the queries that need to compute legacy
// strings. Minimal subset; no Prisma type needed.
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
