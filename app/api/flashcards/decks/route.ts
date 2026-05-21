import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/lib/database/generated/prisma";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import {
  FLASHCARD_DECK_SELECT,
  sanitizeFlashcardCategory,
  sanitizeFlashcardSubcategory,
  slugifyDeckName,
  toFlashcardDeckRecordDto,
} from "@/lib/domain/flashcards";
import type { FlashcardDeckDto } from "@/lib/domain/flashcards";

export async function GET() {
  try {
    const session = await requireAuth();
    const cards = await prisma.flashcard.findMany({
      where: {
        ownerId: session.user.id,
        reviewStatus: { not: "archived" },
      },
      select: {
        category: true,
        subcategory: true,
        reviewStatus: true,
        reviewCount: true,
        viewCount: true,
      },
      orderBy: [{ category: "asc" }, { subcategory: "asc" }],
    });

    const decks = new Map<string, FlashcardDeckDto>();
    for (const card of cards) {
      const key = `${card.category}\u0000${card.subcategory}`;
      const deck =
        decks.get(key) ??
        {
          category: card.category,
          subcategory: card.subcategory,
          count: 0,
          newCount: 0,
          reviewCount: 0,
          masteredCount: 0,
          reviewedCount: 0,
          viewedCount: 0,
        };
      deck.count += 1;
      if (card.reviewStatus === "new") deck.newCount += 1;
      if (card.reviewStatus === "review") deck.reviewCount += 1;
      if (card.reviewStatus === "mastered") deck.masteredCount += 1;
      deck.reviewedCount += card.reviewCount;
      deck.viewedCount += card.viewCount;
      decks.set(key, deck);
    }

    return NextResponse.json({
      success: true,
      data: Array.from(decks.values()),
    });
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

    const where = {
      ownerId: session.user.id,
      category,
      subcategory,
    };
    const matchedCount = await prisma.flashcard.count({ where });

    if (matchedCount === 0) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "No flashcards found." },
        },
        { status: 404 }
      );
    }

    const updated = await prisma.flashcard.updateMany({
      where,
      data: { subcategory: nextSubcategory },
    });

    return NextResponse.json({
      success: true,
      data: {
        matchedCount,
        updatedCount: updated.count,
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
