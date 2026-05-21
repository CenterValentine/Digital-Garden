import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/lib/database/generated/prisma";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import type { FlashcardSettingsDto } from "@/lib/domain/flashcards";

// GET /api/flashcards/parameters
//
// Returns the user's FSRS settings + a status flag indicating whether
// the optimizer has been run. The UI uses this to gate the "Optimize"
// button (disabled until reviewsUsedForOptimization >= 100).
export async function GET() {
  try {
    const session = await requireAuth();

    const [user, reviewsWithRatingCount] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: session.user.id },
        select: {
          desiredRetention: true,
          fsrsMaxInterval: true,
          defaultFlashcardDeckId: true,
          fsrsParameters: true,
        },
      }),
      prisma.flashcardReviewAttempt.count({
        where: { ownerId: session.user.id, rating: { not: null } },
      }),
    ]);

    const stored = user.fsrsParameters as Prisma.JsonObject | null;
    const hasOptimized =
      stored !== null && typeof stored === "object" && Array.isArray(stored.w);
    const optimizedAt =
      hasOptimized && typeof stored.optimizedAt === "string" ? stored.optimizedAt : null;
    const reviewsUsed =
      hasOptimized && typeof stored.reviewsUsed === "number" ? stored.reviewsUsed : 0;

    const data: FlashcardSettingsDto = {
      desiredRetention: user.desiredRetention,
      fsrsMaxInterval: user.fsrsMaxInterval,
      defaultFlashcardDeckId: user.defaultFlashcardDeckId,
      hasOptimizedParameters: hasOptimized,
      parametersOptimizedAt: optimizedAt,
      // Distinct from `reviewsUsed` in the blob: that's reviews used at
      // last optimization. The count here is total scored reviews to
      // date — useful for "you have 87/100 reviews towards your first
      // optimization" UI affordances.
      reviewsUsedForOptimization: reviewsWithRatingCount,
    };

    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load FSRS settings";
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message } },
      { status: message.includes("Authentication") ? 401 : 500 },
    );
  }
}

// PATCH /api/flashcards/parameters
//
// Body (all optional): { desiredRetention, fsrsMaxInterval,
//   defaultFlashcardDeckId }
//
// Note: `fsrsParameters` (the 19-weight array) is NOT directly settable
// — it's the optimizer's output, never user-typed. Routes that try to
// PATCH it are rejected to keep the optimizer's contract clean.
export async function PATCH(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = (await request.json()) as Record<string, unknown>;

    const data: Prisma.UserUpdateInput = {};

    if (typeof body.desiredRetention === "number" && Number.isFinite(body.desiredRetention)) {
      const retention = Math.min(0.97, Math.max(0.7, body.desiredRetention));
      data.desiredRetention = retention;
    }
    if (typeof body.fsrsMaxInterval === "number" && Number.isFinite(body.fsrsMaxInterval)) {
      const max = Math.min(36500, Math.max(1, Math.floor(body.fsrsMaxInterval)));
      data.fsrsMaxInterval = max;
    }
    if ("defaultFlashcardDeckId" in body) {
      const next = body.defaultFlashcardDeckId;
      if (next === null) {
        data.defaultFlashcardDeckId = null;
      } else if (typeof next === "string") {
        // Validate the deck exists and belongs to this user before
        // persisting. Otherwise stale FK references rot silently.
        const deck = await prisma.flashcardDeck.findFirst({
          where: { id: next, ownerId: session.user.id, deletedAt: null },
          select: { id: true },
        });
        if (!deck) {
          return NextResponse.json(
            {
              success: false,
              error: { code: "INVALID_INPUT", message: "Default deck not found." },
            },
            { status: 400 },
          );
        }
        data.defaultFlashcardDeckId = next;
      }
    }
    if ("fsrsParameters" in body) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_INPUT",
            message:
              "fsrsParameters cannot be PATCHed directly — use /parameters/optimize to retune.",
          },
        },
        { status: 400 },
      );
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({
        success: true,
        data: { message: "No changes." },
      });
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data,
      select: { id: true },
    });

    return NextResponse.json({ success: true, data: { updated: Object.keys(data) } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update FSRS settings";
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message } },
      { status: message.includes("Authentication") ? 401 : 500 },
    );
  }
}
