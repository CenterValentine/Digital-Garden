import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/lib/database/generated/prisma";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { resolveContentAccess } from "@/lib/domain/collaboration/access";
import {
  FLASHCARD_SELECT,
  createTextTiptapDoc,
  deriveStateFromLegacyStatus,
  isTiptapDoc,
  normalizeTiptapDoc,
  sanitizeFlashcardCategory,
  sanitizeFlashcardLabel,
  sanitizeFlashcardSubcategory,
  summarizeFlashcardContent,
  toFlashcardDto,
} from "@/lib/domain/flashcards";
import type { FlashcardReviewStatus } from "@/lib/domain/flashcards";
// Deep import — legacy-compat has a Prisma value import and is NOT
// re-exported through the barrel.
import { resolveLegacyDeckId } from "@/lib/domain/flashcards/legacy-compat";

// Sprint 6 changes:
//  - PATCH accepts deckId. If only category/subcategory strings are
//    provided (legacy Panel UI), they resolve to a deckId via
//    resolveLegacyDeckId.
//  - reviewStatus is translated to FSRS state via the legacy-compat
//    map. The legacy reviewStatus / reviewCount / masteredAt columns
//    are gone post-Migration-C.

type Params = Promise<{ id: string }>;

function parseReviewStatus(value: unknown): FlashcardReviewStatus | undefined {
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

async function resolveSourceContentId(value: unknown, userId: string) {
  if (value === null) return null;
  if (typeof value !== "string" || !value) return undefined;

  try {
    await resolveContentAccess(prisma, {
      contentId: value,
      userId,
      require: "view",
    });
    return value;
  } catch {
    throw new Error("Source content is not accessible.");
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const existing = await prisma.flashcard.findFirst({
      where: { id, ownerId: session.user.id, deletedAt: null },
      select: { id: true, isFrontRichText: true },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Flashcard not found" } },
        { status: 404 }
      );
    }

    const data: Prisma.FlashcardUpdateInput = {};
    if ("frontLabel" in body) {
      data.frontLabel = sanitizeFlashcardLabel(body.frontLabel, "Question");
    }
    if ("backLabel" in body) {
      data.backLabel = sanitizeFlashcardLabel(body.backLabel, "Answer");
    }

    // Sprint 6: deck reassignment. Explicit deckId wins; otherwise the
    // legacy category/subcategory pair resolves to a deck.
    if ("deckId" in body && typeof body.deckId === "string") {
      const deckId = body.deckId.trim();
      if (deckId) {
        const deck = await prisma.flashcardDeck.findFirst({
          where: { id: deckId, ownerId: session.user.id, deletedAt: null },
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
        data.deck = { connect: { id: deckId } };
      }
    } else if ("category" in body || "subcategory" in body) {
      // Legacy category/subcategory PATCH — resolve to deckId.
      const category =
        "category" in body ? sanitizeFlashcardCategory(body.category) : "General";
      const subcategory =
        "subcategory" in body ? sanitizeFlashcardSubcategory(body.subcategory) : "";
      const deckId = await resolveLegacyDeckId(
        session.user.id,
        category,
        subcategory
      );
      data.deck = { connect: { id: deckId } };
    }

    if ("isFrontRichText" in body) {
      data.isFrontRichText = body.isFrontRichText === true;
    }
    if ("frontContent" in body || "frontText" in body) {
      const rich =
        "isFrontRichText" in body
          ? body.isFrontRichText === true
          : existing.isFrontRichText;
      if (rich && !isTiptapDoc(body.frontContent)) {
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
      const frontContent = rich
        ? normalizeTiptapDoc(body.frontContent)
        : createTextTiptapDoc(
            typeof body.frontText === "string"
              ? body.frontText
              : summarizeFlashcardContent(body.frontContent)
          );
      data.frontContent = frontContent as Prisma.InputJsonValue;
    }
    if ("backContent" in body) {
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
      data.backContent = normalizeTiptapDoc(body.backContent) as Prisma.InputJsonValue;
    }

    // Sprint 6: reviewStatus PATCH translates to a state change.
    // archived → state=archived (manual hold).
    // new      → state=new (un-archive; resets scheduling).
    // review / mastered → no-op (FSRS-controlled, can't be set from outside).
    if ("reviewStatus" in body) {
      const reviewStatus = parseReviewStatus(body.reviewStatus);
      if (reviewStatus) {
        const translated = deriveStateFromLegacyStatus(reviewStatus, new Date());
        if (translated.state !== undefined) data.state = translated.state;
        if (translated.archivedAt !== undefined) data.archivedAt = translated.archivedAt;
        if (translated.suspendedAt !== undefined) data.suspendedAt = translated.suspendedAt;
      }
    }

    if ("sourceContentId" in body) {
      const sourceContentId = await resolveSourceContentId(
        body.sourceContentId,
        session.user.id
      );
      if (sourceContentId !== undefined) {
        data.sourceContent = sourceContentId
          ? { connect: { id: sourceContentId } }
          : { disconnect: true };
      }
    }

    const updated = await prisma.flashcard.update({
      where: { id },
      data,
      select: FLASHCARD_SELECT,
    });

    return NextResponse.json({ success: true, data: toFlashcardDto(updated) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update flashcard";
    const status = message.includes("Authentication")
      ? 401
      : message.includes("accessible")
        ? 403
        : 500;
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message } },
      { status }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    // Sprint 6: soft-delete instead of hard-delete. The deletedAt
    // column was added in Migration A for exactly this — keeps the
    // FlashcardReviewAttempt audit trail intact, lets users undo, and
    // doesn't break FK references from review attempts.
    const updated = await prisma.flashcard.updateMany({
      where: { id, ownerId: session.user.id, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    if (updated.count === 0) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Flashcard not found" } },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete flashcard";
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message } },
      { status: message.includes("Authentication") ? 401 : 500 }
    );
  }
}
