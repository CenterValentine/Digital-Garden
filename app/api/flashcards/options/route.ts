import { NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { getUserSettings } from "@/lib/features/settings/operations";
import type { FlashcardOptionsDto } from "@/lib/domain/flashcards";

function sorted(values: Iterable<string>) {
  return Array.from(values)
    .map((value) => value.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

export async function GET() {
  try {
    const session = await requireAuth();
    const [settings, cards] = await Promise.all([
      getUserSettings(session.user.id),
      prisma.flashcard.findMany({
        where: { ownerId: session.user.id },
        select: {
          category: true,
          subcategory: true,
          frontLabel: true,
          backLabel: true,
        },
        orderBy: [{ category: "asc" }, { subcategory: "asc" }],
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

    for (const card of cards) {
      categories.add(card.category);
      frontLabels.add(card.frontLabel);
      backLabels.add(card.backLabel);
      if (card.subcategory.trim()) {
        const existing =
          subcategoriesByCategory.get(card.category) ?? new Set<string>();
        existing.add(card.subcategory);
        subcategoriesByCategory.set(card.category, existing);
      }
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
