/* eslint-disable @typescript-eslint/ban-ts-comment -- @ts-nocheck below is
   load-bearing; see file header for why. */
// @ts-nocheck
//
// This script is FROZEN pre-Migration-C tooling. It references the
// `Flashcard.category` and `Flashcard.subcategory` columns that
// Migration C drops; after Migration C runs + `prisma generate`, the
// Prisma client no longer types those columns and this file fails
// typecheck. The @ts-nocheck above pins the file to its pre-migration
// state so it stays compilable for anyone running Migration B on a
// fresh DB. The eslint-disable directive lets the @ts-nocheck pass
// the @typescript-eslint/ban-ts-comment lint rule.
//
// If you're on a fresh DB and need to backfill from a Migration-A
// schema (legacy columns still present), run this script BEFORE
// Migration C. If your DB is already at Migration C, this script has
// no work to do — every card already has a deckId, and the legacy
// findMany at runtime will return zero rows.

/**
 * Backfill FlashcardDeck rows from the legacy Flashcard.category +
 * Flashcard.subcategory string columns (Epoch 19, Sprint 1, Migration B).
 *
 * What this script does (idempotent — safe to re-run):
 *   1. Per owner, distinct `category` strings become root decks.
 *      Slug = slugify(category); path = slug.
 *   2. Per owner, distinct (category, subcategory) pairs become child
 *      decks under their root. Slug = slugify(category-subcategory);
 *      path = root.path + '/' + slugify(subcategory).
 *   3. Every Flashcard.deckId IS NULL row is updated to point at its
 *      leaf deck (subcategory if present, otherwise root).
 *   4. Cards whose category is empty/whitespace get a per-owner "Inbox"
 *      deck. Anki ships an "Inbox" deck by default; we mirror the
 *      convention.
 *   5. After writes, the script verifies that 0 flashcards have NULL
 *      deckId. Exits 1 if any remain — Migration C ALTER TABLE
 *      Flashcard.deckId SET NOT NULL would otherwise fail in prod.
 *
 * Why a script instead of a Prisma migration: the data shape is
 * per-owner and we want per-owner transactions so a single owner's
 * bad data doesn't roll back everyone else's backfill. Prisma's
 * migration runner is a single transaction.
 *
 * Usage:
 *   npx tsx scripts/backfill-flashcard-decks.ts
 *   npx tsx scripts/backfill-flashcard-decks.ts --dry-run
 *   npx tsx scripts/backfill-flashcard-decks.ts --owner=<uuid>
 *
 * Pre-flight:
 *   - .env.local points at the intended branch (dev for dev, prod for prod).
 *   - Migration A has been applied (npx prisma migrate deploy) so the
 *     FlashcardDeck table + Flashcard.deckId column exist.
 */

import "./_load-env.js";
import { prisma } from "../lib/database/client.js";

type Args = {
  dryRun: boolean;
  ownerFilter: string | null;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false, ownerFilter: null };
  for (const a of argv.slice(2)) {
    if (a === "--dry-run") args.dryRun = true;
    else if (a.startsWith("--owner=")) args.ownerFilter = a.slice("--owner=".length);
    else if (a === "--help" || a === "-h") {
      console.log("Usage: backfill-flashcard-decks.ts [--dry-run] [--owner=<uuid>]");
      process.exit(0);
    } else {
      console.error(`Unknown arg: ${a}`);
      process.exit(2);
    }
  }
  return args;
}

// Slug rules match the convention used elsewhere in the codebase
// (publishing/paths, tenants/slug-from-username). Lowercase, replace
// non [a-z0-9-] with '-', collapse repeats, trim, cap at 140 chars
// (FlashcardDeck.slug VARCHAR(140)).
function slugify(input: string, maxLen = 140): string {
  const cleaned = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned.slice(0, maxLen) || "deck";
}

type OwnerStats = {
  ownerId: string;
  rootsCreated: number;
  childrenCreated: number;
  cardsLinked: number;
  inboxUsed: boolean;
};

async function backfillOwner(
  ownerId: string,
  dryRun: boolean,
): Promise<OwnerStats> {
  const stats: OwnerStats = {
    ownerId,
    rootsCreated: 0,
    childrenCreated: 0,
    cardsLinked: 0,
    inboxUsed: false,
  };

  // Collect the distinct (category, subcategory) pairs this owner has on
  // cards with NULL deckId. Cards already linked to a deck are skipped —
  // that's how idempotency works.
  const pairs = await prisma.flashcard.findMany({
    where: { ownerId, deckId: null },
    select: { category: true, subcategory: true },
    distinct: ["category", "subcategory"],
  });
  if (pairs.length === 0) return stats;

  // Bucket: { rootName -> { subcategoryName -> raw category/subcategory } }
  // We use the original string as the deck `name` (preserves user's case),
  // and a derived slug for lookup. Empty category -> "Inbox" root.
  const rootBuckets = new Map<string, Set<string>>();
  for (const p of pairs) {
    const cat = p.category.trim();
    const sub = p.subcategory.trim();
    const rootName = cat === "" ? "Inbox" : cat;
    if (cat === "") stats.inboxUsed = true;
    const subs = rootBuckets.get(rootName) ?? new Set();
    if (sub !== "") subs.add(sub);
    rootBuckets.set(rootName, subs);
  }

  await prisma.$transaction(async (tx) => {
    // Insert / look up root decks.
    const rootByName = new Map<string, { id: string; slug: string }>();
    for (const [rootName] of rootBuckets) {
      const slug = slugify(rootName);
      const path = slug;
      const existing = await tx.flashcardDeck.findUnique({
        where: { ownerId_slug: { ownerId, slug } },
        select: { id: true, slug: true },
      });
      if (existing) {
        rootByName.set(rootName, existing);
        continue;
      }
      if (dryRun) {
        rootByName.set(rootName, { id: "<dry-run>", slug });
        stats.rootsCreated += 1;
        continue;
      }
      const created = await tx.flashcardDeck.create({
        data: {
          ownerId,
          name: rootName,
          slug,
          path,
        },
        select: { id: true, slug: true },
      });
      rootByName.set(rootName, created);
      stats.rootsCreated += 1;
    }

    // Insert / look up child decks.
    const childByKey = new Map<string, { id: string }>();
    for (const [rootName, subs] of rootBuckets) {
      const root = rootByName.get(rootName);
      if (!root) throw new Error(`Root not found for ${rootName}`);
      for (const sub of subs) {
        const childSlug = slugify(`${rootName}-${sub}`);
        const childPath = `${root.slug}/${slugify(sub)}`;
        const existing = await tx.flashcardDeck.findUnique({
          where: { ownerId_slug: { ownerId, slug: childSlug } },
          select: { id: true },
        });
        if (existing) {
          childByKey.set(`${rootName}::${sub}`, existing);
          continue;
        }
        if (dryRun) {
          childByKey.set(`${rootName}::${sub}`, { id: "<dry-run>" });
          stats.childrenCreated += 1;
          continue;
        }
        const created = await tx.flashcardDeck.create({
          data: {
            ownerId,
            parentDeckId: root.id,
            name: sub,
            slug: childSlug,
            path: childPath,
          },
          select: { id: true },
        });
        childByKey.set(`${rootName}::${sub}`, created);
        stats.childrenCreated += 1;
      }
    }

    // Link cards. We process per (category, subcategory) pair so each
    // UPDATE touches a coherent row group.
    for (const p of pairs) {
      const cat = p.category.trim();
      const sub = p.subcategory.trim();
      const rootName = cat === "" ? "Inbox" : cat;
      let targetDeckId: string;
      if (sub === "") {
        const root = rootByName.get(rootName);
        if (!root) throw new Error(`Missing root ${rootName}`);
        targetDeckId = root.id;
      } else {
        const child = childByKey.get(`${rootName}::${sub}`);
        if (!child) throw new Error(`Missing child ${rootName}::${sub}`);
        targetDeckId = child.id;
      }
      if (dryRun) {
        const count = await tx.flashcard.count({
          where: { ownerId, deckId: null, category: p.category, subcategory: p.subcategory },
        });
        stats.cardsLinked += count;
        continue;
      }
      const result = await tx.flashcard.updateMany({
        where: { ownerId, deckId: null, category: p.category, subcategory: p.subcategory },
        data: { deckId: targetDeckId },
      });
      stats.cardsLinked += result.count;
    }
  }, { timeout: 60_000 });

  return stats;
}

async function main() {
  const args = parseArgs(process.argv);
  console.log(`Flashcard deck backfill — ${args.dryRun ? "DRY RUN" : "WRITE"}${args.ownerFilter ? ` (owner=${args.ownerFilter})` : ""}`);

  // Distinct owners with cards needing backfill. Filtering up front avoids
  // doing work for owners who already migrated (idempotency).
  const owners = await prisma.flashcard.findMany({
    where: {
      deckId: null,
      ...(args.ownerFilter ? { ownerId: args.ownerFilter } : {}),
    },
    select: { ownerId: true },
    distinct: ["ownerId"],
  });

  if (owners.length === 0) {
    console.log("Nothing to do — every Flashcard already has a deckId.");
    await prisma.$disconnect();
    return;
  }

  console.log(`Processing ${owners.length} owner(s)...`);
  const allStats: OwnerStats[] = [];
  for (const { ownerId } of owners) {
    try {
      const stats = await backfillOwner(ownerId, args.dryRun);
      allStats.push(stats);
      console.log(
        `  ${ownerId}: roots=${stats.rootsCreated} children=${stats.childrenCreated} cards=${stats.cardsLinked}${stats.inboxUsed ? " (inbox)" : ""}`,
      );
    } catch (err) {
      console.error(`  ${ownerId}: FAILED — ${(err as Error).message}`);
      throw err;
    }
  }

  // Verification: after the writes, no flashcard should have NULL deckId.
  // Skip in dry-run mode since we never wrote anything.
  if (!args.dryRun) {
    const remaining = await prisma.flashcard.count({
      where: {
        deckId: null,
        ...(args.ownerFilter ? { ownerId: args.ownerFilter } : {}),
      },
    });
    if (remaining > 0) {
      console.error(`\nFAIL: ${remaining} flashcards still have NULL deckId after backfill.`);
      console.error("Re-run with --owner=<uuid> on the affected owner(s) to debug.");
      await prisma.$disconnect();
      process.exit(1);
    }
    console.log("\nVerification OK: every Flashcard now has a deckId.");
  }

  const totals = allStats.reduce(
    (acc, s) => ({
      rootsCreated: acc.rootsCreated + s.rootsCreated,
      childrenCreated: acc.childrenCreated + s.childrenCreated,
      cardsLinked: acc.cardsLinked + s.cardsLinked,
    }),
    { rootsCreated: 0, childrenCreated: 0, cardsLinked: 0 },
  );
  console.log(
    `\nTotals: ${totals.rootsCreated} root decks, ${totals.childrenCreated} child decks, ${totals.cardsLinked} cards linked.`,
  );

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
