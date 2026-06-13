import type { Prisma } from "@/lib/database/generated/prisma";
import { prisma as defaultPrisma } from "@/lib/database/client";
import { slugifyDeckName } from "./api";

// SERVER-ONLY helpers (Epoch 19, Sprint 6 — Legacy column sunset).
//
// CRITICAL: this file has a Prisma value import. It is NOT re-exported
// through the barrel `lib/domain/flashcards/index.ts` because any
// client-side consumer importing the barrel would transitively drag
// the pg driver into the client bundle and break the Turbopack build
// with `Module not found: dns/net/tls/fs`.
//
// Server callers import directly:
//   import { resolveLegacyDeckId } from "@/lib/domain/flashcards/legacy-compat";
//
// The pure (client-safe) derivation helpers — deriveLegacyCategoryAndSubcategory,
// deriveLegacyReviewStatus, deriveStateFromLegacyStatus — live in the
// sibling `legacy-derive.ts` and ARE re-exported through the barrel.
//
// Re-export the client-safe helpers from here too so server callers
// have a single import path for all the legacy-compat surface.
export * from "./legacy-derive";

// ─── Write-path deck resolution (server only) ────────────────────

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

  // Root deck for the category. Lookup by path (which equals the root
  // slug at the top level) since the uniqueness constraint is now on
  // (ownerId, path), not (ownerId, slug).
  const rootSlug = slugifyDeckName(category);
  const rootPath = rootSlug;
  let root = await client.flashcardDeck.findUnique({
    where: { ownerId_path: { ownerId, path: rootPath } },
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

  // Child deck for the subcategory under the root. Same parent-prefixed
  // slug for legacy continuity, but lookup is by path (parent/leaf).
  const childSlug = slugifyDeckName(`${category}-${subcategory}`);
  const childPath = `${root.path}/${slugifyDeckName(subcategory)}`;
  const child = await client.flashcardDeck.findUnique({
    where: { ownerId_path: { ownerId, path: childPath } },
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

// ─── Full-path resolution (server only) ──────────────────────────
//
// Walks a full path like "vietnamese/tones/six-tones" and ensures each
// segment exists as a deck, creating any missing ancestors top-down.
// Returns the LEAF segment's deck id + canonical path.
//
// Used by:
//   - POST /api/flashcards/decks   (propose_deck_with_cards absorb flow,
//     called with `parentDeckPath`)
//   - POST /api/flashcards         (path-based card create, `deckPath`)
//
// Each missing segment's display `name` is title-cased from its
// kebab-case slug ("ai-concepts" → "Ai Concepts"). Imperfect for
// acronyms; the user can rename auto-created ancestors later via PATCH
// /api/flashcards/decks/[id]. Caps depth at 8 to bound runaway paths.
export async function ensureDeckPath(
  ownerId: string,
  fullPath: string,
  client: Prisma.TransactionClient | typeof defaultPrisma = defaultPrisma,
): Promise<{ deckId: string; path: string }> {
  // Normalize each raw segment to its canonical slug so a hand-typed
  // path ("Latin / Grammar") lands on the same decks a slug-built path
  // ("latin/grammar") would. Empty segments (double slashes, trailing
  // separators) are dropped.
  const segments = fullPath
    .split("/")
    .map((segment) => slugifyDeckName(segment))
    .filter((segment) => segment && segment !== "deck");
  if (segments.length === 0) throw new Error("Empty deck path.");
  if (segments.length > 8) throw new Error("Deck path too deep (max 8 levels).");

  let currentPath = "";
  let currentParentId: string | null = null;
  let currentDeckId = "";

  for (const segment of segments) {
    currentPath = currentPath ? `${currentPath}/${segment}` : segment;
    let deck = await client.flashcardDeck.findUnique({
      where: { ownerId_path: { ownerId, path: currentPath } },
      select: { id: true },
    });
    if (!deck) {
      // Derive a display name from the slug. Kebab → space + title.
      const name = segment
        .split("-")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
      deck = await client.flashcardDeck.create({
        data: {
          ownerId,
          name,
          slug: segment,
          path: currentPath,
          ...(currentParentId ? { parentDeckId: currentParentId } : {}),
        },
        select: { id: true },
      });
    }
    currentParentId = deck.id;
    currentDeckId = deck.id;
  }

  return { deckId: currentDeckId, path: currentPath };
}

// ─── Subtree resolution (server only) ────────────────────────────
//
// Returns the given deck's id plus the ids of every (non-deleted)
// descendant deck, using the materialized `path` prefix. Used by
// GET /api/flashcards?deckId=…&includeDescendants=true to gather cards
// for a "play this whole skill" review session.
//
// Returns an empty array if the deck doesn't exist or isn't owned by
// the caller — the route then yields zero cards, which the UI handles.
export async function resolveDescendantDeckIds(
  ownerId: string,
  deckId: string,
  client: Prisma.TransactionClient | typeof defaultPrisma = defaultPrisma,
): Promise<string[]> {
  const deck = await client.flashcardDeck.findFirst({
    where: { id: deckId, ownerId, deletedAt: null },
    select: { id: true, path: true },
  });
  if (!deck) return [];

  const descendants = await client.flashcardDeck.findMany({
    where: {
      ownerId,
      deletedAt: null,
      path: { startsWith: `${deck.path}/` },
    },
    select: { id: true },
  });

  return [deck.id, ...descendants.map((d) => d.id)];
}
