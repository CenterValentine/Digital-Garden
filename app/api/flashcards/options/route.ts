import { NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { getUserSettings } from "@/lib/features/settings/operations";
import type { FlashcardOptionsDto } from "@/lib/domain/flashcards";

// Sprint 6: legacy categories/subcategories derived from the
// FlashcardDeck table (root deck name → category, child deck name →
// subcategory). frontLabels/backLabels still come from Flashcard rows
// since those columns weren't dropped.

function sorted(values: Iterable<string>) {
  return Array.from(values)
    .map((value) => value.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

export async function GET() {
  try {
    const session = await requireAuth();
    const [settings, decks, cards] = await Promise.all([
      getUserSettings(session.user.id),
      prisma.flashcardDeck.findMany({
        where: { ownerId: session.user.id, deletedAt: null },
        select: {
          name: true,
          parentDeckId: true,
          parent: { select: { name: true } },
        },
      }),
      prisma.flashcard.findMany({
        where: { ownerId: session.user.id, deletedAt: null },
        select: { frontLabel: true, backLabel: true },
        take: 1000,
      }),
    ]);

    const categories = new Set<string>([
      settings.flashcards?.lastUsedCategory ?? "General",
      "General",
    ]);
    const frontLabels = new Set<string>([
      settings.flashcards?.defaultFrontLabel ?? "Question",
      "Question",
    ]);
    const backLabels = new Set<string>([
      settings.flashcards?.defaultBackLabel ?? "Answer",
      "Answer",
    ]);
    const subcategoriesByCategory = new Map<string, Set<string>>();

    for (const deck of decks) {
      if (deck.parentDeckId && deck.parent) {
        categories.add(deck.parent.name);
        const existing =
          subcategoriesByCategory.get(deck.parent.name) ?? new Set<string>();
        existing.add(deck.name);
        subcategoriesByCategory.set(deck.parent.name, existing);
      } else {
        categories.add(deck.name);
      }
    }

    for (const card of cards) {
      frontLabels.add(card.frontLabel);
      backLabels.add(card.backLabel);
    }

    if (settings.flashcards?.lastUsedSubcategory?.trim()) {
      const category = settings.flashcards?.lastUsedCategory ?? "General";
      const existing = subcategoriesByCategory.get(category) ?? new Set<string>();
      existing.add(settings.flashcards.lastUsedSubcategory);
      subcategoriesByCategory.set(category, existing);
    }

    const data: FlashcardOptionsDto = {
      categories: sorted(categories),
      subcategoriesByCategory: Object.fromEntries(
        Array.from(subcategoriesByCategory.entries()).map(([category, values]) => [
          category,
          sorted(values),
        ])
      ),
      frontLabels: sorted(frontLabels),
      backLabels: sorted(backLabels),
    };

    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load flashcard options";
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message } },
      { status: message.includes("Authentication") ? 401 : 500 }
    );
  }
}
