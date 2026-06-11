import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/lib/database/generated/prisma";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { resolveContentAccess } from "@/lib/domain/collaboration/access";
import { updateUserSettings } from "@/lib/features/settings/operations";
import {
  FLASHCARD_SELECT,
  createTextTiptapDoc,
  isTiptapDoc,
  normalizeTiptapDoc,
  sanitizeFlashcardCategory,
  sanitizeFlashcardLabel,
  sanitizeFlashcardSubcategory,
  summarizeFlashcardContent,
  toFlashcardDto,
} from "@/lib/domain/flashcards";
import type {
  FlashcardReviewStatus,
  FlashcardState,
} from "@/lib/domain/flashcards";
// Deep import — legacy-compat has a Prisma value import and is NOT
// re-exported through the barrel (see legacy-compat.ts header).
import { resolveLegacyDeckId } from "@/lib/domain/flashcards/legacy-compat";
import { fileFlashcardMediaUnderDeck } from "@/lib/domain/flashcards/media-folder";

// Sprint 6 changes:
//  - POST: deckId is the source of truth. If the request only carries
//    legacy category/subcategory strings, we look-up-or-create the
//    implied deck via resolveLegacyDeckId so the FK is always written.
//    The legacy columns are NOT written (they're dropped by Migration C).
//  - GET: accepts deckId OR category/subcategory (the latter resolves
//    to a deckId via the same lookup). reviewStatus filter translates
//    to a FSRS state filter via the legacy-compat map.

function parseLegacyReviewStatus(value: string | null): FlashcardReviewStatus | undefined {
  if (
    value === "new" ||
    value === "review" ||
    value === "mastered" ||
    value === "archived"
  ) {
    return value;
  }
  return undefined;
}

// Translate legacy reviewStatus to a FSRS state WHERE-clause fragment.
// The legacy 4-value enum maps lossy-but-reasonable onto the FSRS
// states; "mastered" was always a heuristic derivation, so it filters
// to state=review (the only state where mastered cards live).
function statesForLegacyStatus(status: FlashcardReviewStatus): FlashcardState[] {
  switch (status) {
    case "new":
      return ["new"];
    case "review":
      return ["learning", "review", "relearning"];
    case "mastered":
      return ["review"]; // heuristic — refined by reps/lapses downstream
    case "archived":
      return ["archived"];
  }
}

async function assertSourceContentAccess(sourceContentId: unknown, userId: string) {
  if (typeof sourceContentId !== "string" || !sourceContentId) return null;

  try {
    await resolveContentAccess(prisma, {
      contentId: sourceContentId,
      userId,
      require: "view",
    });
    return sourceContentId;
  } catch {
    throw new Error("Source content is not accessible.");
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    const { searchParams } = new URL(request.url);
    const explicitDeckId = searchParams.get("deckId");
    const category = searchParams.get("category");
    const subcategory = searchParams.get("subcategory");
    const sourceContentId = searchParams.get("sourceContentId");
    const reviewStatus = parseLegacyReviewStatus(searchParams.get("reviewStatus"));

    // Resolve deckId filter. Explicit param takes precedence. When
    // category/subcategory strings are supplied (legacy Panel UI), we
    // resolve them via lookup — but unlike the write path, we don't
    // auto-create here. A query for a non-existent deck returns empty.
    let deckIdFilter: string | undefined;
    if (explicitDeckId) {
      deckIdFilter = explicitDeckId;
    } else if (category !== null) {
      const cat = category.trim() || "General";
      const sub = subcategory?.trim() ?? "";
      const path = sub
        ? `${slugify(cat)}/${slugify(sub)}` // matches resolveLegacyDeckId child-path pattern
        : slugify(cat);
      const deck = await prisma.flashcardDeck.findUnique({
        where: { ownerId_path: { ownerId: session.user.id, path } },
        select: { id: true },
      });
      if (!deck) {
        // No matching deck → no cards. Return the legacy-shape empty
        // array so the Panel UI handles "no cards" gracefully.
        return NextResponse.json({ success: true, data: [] });
      }
      deckIdFilter = deck.id;
    }

    const where: Prisma.FlashcardWhereInput = {
      ownerId: session.user.id,
      deletedAt: null,
      ...(deckIdFilter ? { deckId: deckIdFilter } : {}),
      ...(sourceContentId ? { sourceContentId } : {}),
      ...(reviewStatus
        ? { state: { in: statesForLegacyStatus(reviewStatus) } }
        : { state: { not: "archived" } }),
    };

    const cards = await prisma.flashcard.findMany({
      where,
      select: FLASHCARD_SELECT,
      orderBy: [{ updatedAt: "desc" }],
      take: 200,
    });

    return NextResponse.json({
      success: true,
      data: cards.map(toFlashcardDto),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load flashcards";
    return NextResponse.json(
      {
        success: false,
        error: { code: "SERVER_ERROR", message },
      },
      { status: message.includes("Authentication") ? 401 : 500 }
    );
  }
}

// Internal slug helper — duplicated from api.ts's slugifyDeckName so we
// can use it inside the route without importing through the barrel
// (which adds the legacy-compat surface unnecessarily here).
function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 140) || "deck";
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = (await request.json()) as Record<string, unknown>;

    const isFrontRichText = body.isFrontRichText === true;
    if (isFrontRichText && !isTiptapDoc(body.frontContent)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_CONTENT",
            message: "Front content must be a Tiptap document.",
          },
        },
        { status: 400 }
      );
    }
    if (!isTiptapDoc(body.backContent)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_CONTENT",
            message: "Back content must be a Tiptap document.",
          },
        },
        { status: 400 }
      );
    }
    const frontContent = isFrontRichText
      ? normalizeTiptapDoc(body.frontContent)
      : createTextTiptapDoc(
          typeof body.frontText === "string"
            ? body.frontText
            : summarizeFlashcardContent(body.frontContent)
        );
    const backContent = normalizeTiptapDoc(body.backContent);
    const sourceContentId = await assertSourceContentAccess(
      body.sourceContentId,
      session.user.id
    );

    // Sprint 6: resolve deckId. Explicit deckId in the body wins.
    // Otherwise fall back to the legacy category/subcategory strings
    // (look-up-or-create the implied deck). At least one path must
    // produce a deckId — refuse if both are missing.
    const category = sanitizeFlashcardCategory(body.category);
    const subcategory = sanitizeFlashcardSubcategory(body.subcategory);
    const explicitDeckId =
      typeof body.deckId === "string" && body.deckId.trim() ? body.deckId.trim() : null;

    let deckId: string;
    if (explicitDeckId) {
      // Validate the deck exists + belongs to this user.
      const deck = await prisma.flashcardDeck.findFirst({
        where: { id: explicitDeckId, ownerId: session.user.id, deletedAt: null },
        select: { id: true },
      });
      if (!deck) {
        return NextResponse.json(
          {
            success: false,
            error: { code: "INVALID_INPUT", message: "Deck not found." },
          },
          { status: 400 }
        );
      }
      deckId = deck.id;
    } else {
      deckId = await resolveLegacyDeckId(session.user.id, category, subcategory);
    }

    const card = await prisma.flashcard.create({
      data: {
        ownerId: session.user.id,
        sourceContentId,
        frontLabel: sanitizeFlashcardLabel(body.frontLabel, "Question"),
        backLabel: sanitizeFlashcardLabel(body.backLabel, "Answer"),
        frontContent: frontContent as Prisma.InputJsonValue,
        backContent: backContent as Prisma.InputJsonValue,
        isFrontRichText,
        deckId,
      },
      select: FLASHCARD_SELECT,
    });

    // File any generated/referenced media embedded in this card into the
    // deck-mirrored `referenced` folder, so it doesn't pile up at the root.
    // Best-effort — never blocks card creation.
    await fileFlashcardMediaUnderDeck(
      session.user.id,
      deckId,
      frontContent,
      backContent,
    );

    // Persist "last used" for the prefill route. We still write the
    // legacy strings into User.settings so the Panel's autocomplete
    // continues to work — that field is a Json blob, not a column
    // being dropped.
    await updateUserSettings(session.user.id, {
      flashcards: {
        lastUsedCategory: category || "General",
        lastUsedSubcategory: subcategory,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: toFlashcardDto(card),
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create flashcard";
    const status = message.includes("Authentication")
      ? 401
      : message.includes("accessible")
        ? 403
        : 500;
    return NextResponse.json(
      {
        success: false,
        error: { code: status === 403 ? "FORBIDDEN" : "SERVER_ERROR", message },
      },
      { status }
    );
  }
}
