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
import type { FlashcardReviewStatus } from "@/lib/domain/flashcards";

function parseReviewStatus(value: string | null): FlashcardReviewStatus | undefined {
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
    const category = searchParams.get("category");
    const subcategory = searchParams.get("subcategory");
    const sourceContentId = searchParams.get("sourceContentId");
    const reviewStatus = parseReviewStatus(searchParams.get("reviewStatus"));

    const where: Prisma.FlashcardWhereInput = {
      ownerId: session.user.id,
      ...(category ? { category } : {}),
      ...(subcategory !== null ? { subcategory } : {}),
      ...(sourceContentId ? { sourceContentId } : {}),
      ...(reviewStatus ? { reviewStatus } : { reviewStatus: { not: "archived" } }),
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
    const category = sanitizeFlashcardCategory(body.category);
    const subcategory = sanitizeFlashcardSubcategory(body.subcategory);

    const card = await prisma.flashcard.create({
      data: {
        ownerId: session.user.id,
        sourceContentId,
        frontLabel: sanitizeFlashcardLabel(body.frontLabel, "Question"),
        backLabel: sanitizeFlashcardLabel(body.backLabel, "Answer"),
        frontContent: frontContent as Prisma.InputJsonValue,
        backContent: backContent as Prisma.InputJsonValue,
        isFrontRichText,
        category,
        subcategory,
      },
      select: FLASHCARD_SELECT,
    });

    await updateUserSettings(session.user.id, {
      flashcards: {
        lastUsedCategory: category,
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
