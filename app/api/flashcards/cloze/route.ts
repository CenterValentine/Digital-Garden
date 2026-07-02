/**
 * Cloze Card Creation Endpoint — Session 3B
 *
 * POST /api/flashcards/cloze
 *
 * Accepts a TipTap source document containing cloze marks and creates
 * one Flashcard row per unique ordinal, all sharing a noteId and
 * cardType="cloze". The full source doc is stored on each row as
 * clozeSourceJson for re-extraction on edit.
 *
 * Returns 400 if the source contains no cloze marks (nothing to
 * generate). Returns the DTOs of all created cards on success.
 */

import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/lib/database/generated/prisma";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import {
  FLASHCARD_SELECT,
  isTiptapDoc,
  normalizeTiptapDoc,
  sanitizeFlashcardCategory,
  sanitizeFlashcardLabel,
  sanitizeFlashcardSubcategory,
  toFlashcardDto,
} from "@/lib/domain/flashcards";
import {
  ensureDeckPath,
  resolveLegacyDeckId,
} from "@/lib/domain/flashcards/legacy-compat";
import {
  extractClozeCards,
  type TipTapNode,
} from "@/lib/domain/flashcards/cloze/extract";

interface ClozeCreateBody {
  deckId?: string;
  deckPath?: string;
  category?: string;
  subcategory?: string;
  sourceJson?: unknown;
  frontLabel?: string;
  backLabel?: string;
  sourceContentId?: string | null;
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = (await request.json()) as ClozeCreateBody;

    // Mirror the basic POST endpoint: explicit deckId wins, otherwise
    // resolve from category/subcategory (legacy path used by the
    // QuickAdd form). At least one path must yield a deckId.
    const explicitDeckId =
      typeof body.deckId === "string" && body.deckId.trim()
        ? body.deckId.trim()
        : null;
    const deckPath =
      typeof body.deckPath === "string" && body.deckPath.trim()
        ? body.deckPath.trim()
        : null;
    const category = sanitizeFlashcardCategory(body.category);
    const subcategory = sanitizeFlashcardSubcategory(body.subcategory);

    if (!isTiptapDoc(body.sourceJson)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_CONTENT",
            message: "sourceJson must be a Tiptap document.",
          },
        },
        { status: 400 },
      );
    }

    const sourceJson = normalizeTiptapDoc(body.sourceJson);

    let deckId: string;
    if (explicitDeckId) {
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
          { status: 400 },
        );
      }
      deckId = deck.id;
    } else if (deckPath) {
      try {
        ({ deckId } = await ensureDeckPath(session.user.id, deckPath));
      } catch (err) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "INVALID_INPUT",
              message: err instanceof Error ? err.message : "Invalid deck path.",
            },
          },
          { status: 400 },
        );
      }
    } else {
      deckId = await resolveLegacyDeckId(session.user.id, category, subcategory);
    }

    const clozeCards = extractClozeCards(sourceJson as TipTapNode);
    if (clozeCards.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "NO_CLOZE_MARKS",
            message:
              "Source document has no cloze deletions — mark text with Cmd+Shift+C first.",
          },
        },
        { status: 400 },
      );
    }

    // Sibling group: one noteId shared across all generated cards.
    // Server-generated to prevent client collisions; row deletion
    // doesn't break the grouping (the surviving siblings still share).
    const noteId = randomUUID();
    const frontLabel = sanitizeFlashcardLabel(body.frontLabel, "Question");
    const backLabel = sanitizeFlashcardLabel(body.backLabel, "Answer");

    // Transactional N inserts — if any fails, all rollback. Important
    // because partial sibling sets are misleading ("why is there cloze
    // #2 with no cloze #1?").
    const created = await prisma.$transaction(
      clozeCards.map((card) =>
        prisma.flashcard.create({
          data: {
            ownerId: session.user.id,
            sourceContentId:
              typeof body.sourceContentId === "string" && body.sourceContentId
                ? body.sourceContentId
                : null,
            frontLabel,
            backLabel,
            frontContent: card.frontJson as unknown as Prisma.InputJsonValue,
            backContent: card.backJson as unknown as Prisma.InputJsonValue,
            // The back-side cloze mark renders the highlighted answer
            // via CSS — that's rich content, so flag isFrontRichText
            // true so the overlay renders via AdaptiveFlashcardEditor
            // (rich mode) rather than the plain-text branch.
            isFrontRichText: true,
            deckId,
            cardType: "cloze",
            noteId,
            clozeOrdinal: card.ordinal,
            clozeSourceJson: sourceJson as unknown as Prisma.InputJsonValue,
          },
          select: FLASHCARD_SELECT,
        }),
      ),
    );

    return NextResponse.json(
      {
        success: true,
        data: created.map((c) => toFlashcardDto(c)),
        meta: {
          noteId,
          cardsCreated: created.length,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create cloze cards";
    const status = message.includes("Authentication") ? 401 : 500;
    return NextResponse.json(
      {
        success: false,
        error: { code: status === 401 ? "UNAUTHORIZED" : "SERVER_ERROR", message },
      },
      { status },
    );
  }
}
