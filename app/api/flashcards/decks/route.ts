import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/lib/database/generated/prisma";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import {
  FLASHCARD_DECK_SELECT,
  deriveLegacyCategoryAndSubcategory,
  sanitizeFlashcardCategory,
  sanitizeFlashcardSubcategory,
  slugifyDeckName,
  toFlashcardDeckRecordDto,
} from "@/lib/domain/flashcards";
import type { FlashcardDeckDto } from "@/lib/domain/flashcards";
// Deep import — legacy-compat has a Prisma value import and is NOT
// re-exported through the barrel.
import { resolveLegacyDeckId } from "@/lib/domain/flashcards/legacy-compat";

export async function GET() {
  try {
    const session = await requireAuth();
    const ownerId = session.user.id;

    const [decks, totalCounts, newCounts, masteredHints] = await Promise.all([
      prisma.flashcardDeck.findMany({
        where: { ownerId, deletedAt: null },
        select: {
          id: true,
          name: true,
          parentDeckId: true,
          parent: { select: { name: true } },
        },
        orderBy: [{ path: "asc" }],
      }),
      prisma.flashcard.groupBy({
        by: ["deckId"],
        where: {
          ownerId,
          deletedAt: null,
          state: { not: "archived" },
          deckId: { not: null },
        },
        _count: { _all: true },
        _sum: { reps: true, viewCount: true },
      }),
      prisma.flashcard.groupBy({
        by: ["deckId"],
        where: { ownerId, deletedAt: null, state: "new", deckId: { not: null } },
        _count: { _all: true },
      }),
      prisma.flashcard.groupBy({
        by: ["deckId"],
        where: {
          ownerId,
          deletedAt: null,
          state: "review",
          lapses: 0,
          reps: { gte: 5 }, // legacy "mastered" heuristic — see legacy-compat.ts
          deckId: { not: null },
        },
        _count: { _all: true },
      }),
    ]);

    const totalByDeck = new Map<
      string,
      { count: number; reviewedCount: number; viewedCount: number }
    >();
    for (const row of totalCounts) {
      if (!row.deckId) continue;
      totalByDeck.set(row.deckId, {
        count: row._count._all,
        reviewedCount: row._sum.reps ?? 0,
        viewedCount: row._sum.viewCount ?? 0,
      });
    }
    const newByDeck = new Map<string, number>();
    for (const row of newCounts) {
      if (row.deckId) newByDeck.set(row.deckId, row._count._all);
    }
    const masteredByDeck = new Map<string, number>();
    for (const row of masteredHints) {
      if (row.deckId) masteredByDeck.set(row.deckId, row._count._all);
    }

    const data: FlashcardDeckDto[] = decks.flatMap((deck) => {
      const totals = totalByDeck.get(deck.id);
      if (!totals || totals.count === 0) return [];
      const { category, subcategory } = deriveLegacyCategoryAndSubcategory({
        name: deck.name,
        parentDeckId: deck.parentDeckId,
        parent: deck.parent ?? null,
      });
      const newCount = newByDeck.get(deck.id) ?? 0;
      const masteredCount = masteredByDeck.get(deck.id) ?? 0;
      const reviewCount = totals.count - newCount - masteredCount;
      return [
        {
          category,
          subcategory,
          count: totals.count,
          newCount,
          reviewCount: Math.max(0, reviewCount),
          masteredCount,
          reviewedCount: totals.reviewedCount,
          viewedCount: totals.viewedCount,
        },
      ];
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load decks";
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message } },
      { status: message.includes("Authentication") ? 401 : 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = (await request.json()) as Record<string, unknown>;
    const category =
      typeof body.category === "string" ? sanitizeFlashcardCategory(body.category) : "";
    const subcategory =
      typeof body.subcategory === "string"
        ? sanitizeFlashcardSubcategory(body.subcategory)
        : "";
    const nextSubcategory =
      typeof body.nextSubcategory === "string"
        ? sanitizeFlashcardSubcategory(body.nextSubcategory)
        : "";

    if (!category) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_INPUT", message: "Skill is required." },
        },
        { status: 400 }
      );
    }

    // Sprint 6: locate the deck this (category, subcategory) pair
    // points to. Same slug rule as resolveLegacyDeckId — but we don't
    // auto-create here, since a rename of a non-existent deck is a 404.
    const sourceSlug = subcategory
      ? `${slugifyDeckName(category)}-${slugifyDeckName(subcategory)}`
      : slugifyDeckName(category);
    const sourceDeck = await prisma.flashcardDeck.findUnique({
      where: { ownerId_slug: { ownerId: session.user.id, slug: sourceSlug } },
      select: { id: true, parentDeckId: true, path: true },
    });
    if (!sourceDeck) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Deck not found." } },
        { status: 404 }
      );
    }

    const matchedCount = await prisma.flashcard.count({
      where: { ownerId: session.user.id, deckId: sourceDeck.id, deletedAt: null },
    });
    if (matchedCount === 0) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "No flashcards found." },
        },
        { status: 404 }
      );
    }

    // Three rename shapes:
    //   1. (sub, nextSub both non-empty) → rename the child deck.
    //   2. (sub non-empty, nextSub empty) → move cards up to the root deck.
    //   3. (sub empty, nextSub non-empty) → move cards down into a new
    //      child deck.
    let updatedCount = matchedCount;
    if (subcategory && nextSubcategory) {
      const newSlug = `${slugifyDeckName(category)}-${slugifyDeckName(nextSubcategory)}`;
      const parentPath = sourceDeck.path.split("/").slice(0, -1).join("/");
      const newPath = `${parentPath}/${slugifyDeckName(nextSubcategory)}`;
      try {
        await prisma.flashcardDeck.update({
          where: { id: sourceDeck.id },
          data: { name: nextSubcategory, slug: newSlug, path: newPath },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: "CONFLICT",
                message: "A deck with that name already exists at this level.",
              },
            },
            { status: 409 }
          );
        }
        throw err;
      }
    } else if (subcategory && !nextSubcategory) {
      const rootDeckId = await resolveLegacyDeckId(session.user.id, category, "");
      const moved = await prisma.flashcard.updateMany({
        where: { ownerId: session.user.id, deckId: sourceDeck.id, deletedAt: null },
        data: { deckId: rootDeckId },
      });
      updatedCount = moved.count;
    } else if (!subcategory && nextSubcategory) {
      const targetDeckId = await resolveLegacyDeckId(
        session.user.id,
        category,
        nextSubcategory
      );
      const moved = await prisma.flashcard.updateMany({
        where: { ownerId: session.user.id, deckId: sourceDeck.id, deletedAt: null },
        data: { deckId: targetDeckId },
      });
      updatedCount = moved.count;
    }

    return NextResponse.json({
      success: true,
      data: {
        matchedCount,
        updatedCount,
        category,
        subcategory: nextSubcategory,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update deck.";
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message } },
      { status: message.includes("Authentication") ? 401 : 500 }
    );
  }
}

// POST /api/flashcards/decks
//
// Create a new FlashcardDeck row (Epoch 19 FK paradigm).
//
// Body: { name (required), parentDeckId?, description?, iconName?,
//   iconColor?, displayOrder? }
//
// Path is computed server-side as parentPath + "/" + slug. Slug is
// generated from name via slugifyDeckName so it matches the convention
// used by the backfill script.
//
// 409 CONFLICT if a sibling deck with the same name already exists
// (enforced by the (ownerId, parentDeckId, name) unique constraint).
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = (await request.json()) as Record<string, unknown>;

    const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
    if (!name) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_INPUT", message: "Deck name is required." } },
        { status: 400 }
      );
    }

    let parentDeckId: string | null = null;
    let parentPath: string | null = null;
    if (typeof body.parentDeckId === "string" && body.parentDeckId) {
      const parent = await prisma.flashcardDeck.findFirst({
        where: { id: body.parentDeckId, ownerId: session.user.id, deletedAt: null },
        select: { id: true, path: true },
      });
      if (!parent) {
        return NextResponse.json(
          {
            success: false,
            error: { code: "INVALID_INPUT", message: "Parent deck not found." },
          },
          { status: 400 }
        );
      }
      parentDeckId = parent.id;
      parentPath = parent.path;
    }

    const slug = slugifyDeckName(name);
    const path = parentPath ? `${parentPath}/${slug}` : slug;
    const description =
      typeof body.description === "string" ? body.description.trim().slice(0, 500) || null : null;
    const iconName =
      typeof body.iconName === "string" ? body.iconName.trim().slice(0, 60) || null : null;
    const iconColor =
      typeof body.iconColor === "string" ? body.iconColor.trim().slice(0, 20) || null : null;
    const displayOrder =
      typeof body.displayOrder === "number" && Number.isFinite(body.displayOrder)
        ? Math.trunc(body.displayOrder)
        : 0;

    try {
      const deck = await prisma.flashcardDeck.create({
        data: {
          ownerId: session.user.id,
          name,
          slug,
          path,
          description,
          iconName,
          iconColor,
          displayOrder,
          ...(parentDeckId ? { parentDeckId } : {}),
        },
        select: FLASHCARD_DECK_SELECT,
      });
      return NextResponse.json(
        { success: true, data: toFlashcardDeckRecordDto(deck) },
        { status: 201 }
      );
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "CONFLICT",
              message: "A deck with this name already exists at that level.",
            },
          },
          { status: 409 }
        );
      }
      throw err;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create deck";
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message } },
      { status: message.includes("Authentication") ? 401 : 500 }
    );
  }
}
