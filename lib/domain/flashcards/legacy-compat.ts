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
