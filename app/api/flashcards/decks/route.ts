import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import {
  sanitizeFlashcardCategory,
  sanitizeFlashcardSubcategory,
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
