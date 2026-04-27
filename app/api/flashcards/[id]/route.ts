import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/lib/database/generated/prisma";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { resolveContentAccess } from "@/lib/domain/collaboration/access";
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
import type { FlashcardReviewStatus } from "@/lib/domain/flashcards";

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
      where: { id, ownerId: session.user.id },
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
    if ("category" in body) {
      data.category = sanitizeFlashcardCategory(body.category);
    }
    if ("subcategory" in body) {
      data.subcategory = sanitizeFlashcardSubcategory(body.subcategory);
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
    if ("reviewStatus" in body) {
      const reviewStatus = parseReviewStatus(body.reviewStatus);
      if (reviewStatus) {
        data.reviewStatus = reviewStatus;
        if (reviewStatus !== "mastered") data.masteredAt = null;
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
    const deleted = await prisma.flashcard.deleteMany({
      where: { id, ownerId: session.user.id },
    });

    if (deleted.count === 0) {
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
