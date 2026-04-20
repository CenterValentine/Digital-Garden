import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { resolveContentAccess } from "@/lib/domain/collaboration/access";
import { getUserSettings } from "@/lib/features/settings/operations";

function getMetadataFlashcards(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const metadata = value as { flashcards?: unknown };
  if (!metadata.flashcards || typeof metadata.flashcards !== "object") return null;
  const flashcards = metadata.flashcards as {
    category?: unknown;
    subcategory?: unknown;
  };
  return {
    category:
      typeof flashcards.category === "string" ? flashcards.category.trim() : "",
    subcategory:
      typeof flashcards.subcategory === "string"
        ? flashcards.subcategory.trim()
        : "",
  };
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    const { searchParams } = new URL(request.url);
    const sourceContentId = searchParams.get("sourceContentId");
    const settings = await getUserSettings(session.user.id);
    let sourceTitle: string | null = null;
    let sourceCategory: string | null = null;
    let metadataCategory = "";
    let metadataSubcategory = "";

    if (sourceContentId) {
      try {
        await resolveContentAccess(prisma, {
          contentId: sourceContentId,
          userId: session.user.id,
          require: "view",
        });
        const content = await prisma.contentNode.findUnique({
          where: { id: sourceContentId },
          select: {
            title: true,
            notePayload: { select: { metadata: true } },
            category: { select: { name: true } },
          },
        });
        sourceTitle = content?.title ?? null;
        sourceCategory = content?.category?.name ?? null;
        const metadataFlashcards = getMetadataFlashcards(content?.notePayload?.metadata);
        metadataCategory = metadataFlashcards?.category ?? "";
        metadataSubcategory = metadataFlashcards?.subcategory ?? "";
      } catch {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "FORBIDDEN",
              message: "Source content is not accessible.",
            },
          },
          { status: 403 }
        );
      }
    }

    const category =
      metadataCategory ||
      settings.flashcards?.lastUsedCategory ||
      sourceCategory ||
      "General";
    const subcategory =
      metadataSubcategory || settings.flashcards?.lastUsedSubcategory || "";

    return NextResponse.json({
      success: true,
      data: {
        sourceContentId: sourceContentId ?? null,
        sourceTitle,
        category,
        subcategory,
        frontLabel: settings.flashcards?.defaultFrontLabel || "Question",
        backLabel: settings.flashcards?.defaultBackLabel || "Answer",
        reviewMode: settings.flashcards?.defaultReviewMode || "front_to_back",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load flashcard defaults";
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message } },
      { status: message.includes("Authentication") ? 401 : 500 }
    );
  }
}
