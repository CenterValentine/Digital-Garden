import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { logger, withRouteTrace } from "@/lib/core/logger";

const ROUTE_PATH = "/api/periodic-notes/neighbors";

interface NeighborNote {
  id: string;
  title: string;
  periodKey: string;
}

/**
 * Sparse "glide" navigation between periodic notes.
 *
 * Given the currently-open note's contentId, returns the nearest EXISTING
 * periodic note before and after it in its own sequence (daily or weekly).
 * "Sparse" = it skips gaps: if you journaled July 3 then July 10, the
 * neighbor of July 10 going back is July 3, not July 9.
 *
 * This leans entirely on PeriodicNoteIndex: `periodKey` (YYYY-MM-DD /
 * GGGG-[W]WW) sorts lexicographically identically to chronologically, and the
 * `@@unique([ownerId, kind, periodKey])` constraint is a B-tree index, so each
 * neighbor lookup is an indexed range seek that stops at the first row.
 */
export async function GET(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await requireAuth();
      const contentId = request.nextUrl.searchParams.get("contentId");

      if (!contentId) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "contentId is required.",
            },
          },
          { status: 400 }
        );
      }

      // Reverse-lookup the current note's place in the sequence (indexed via
      // @@index([contentId])). If it isn't a periodic note, there's nothing to
      // glide between — the client hides the controls on isPeriodic: false.
      const current = await prisma.periodicNoteIndex.findFirst({
        where: { ownerId: session.user.id, contentId },
        select: { kind: true, periodKey: true },
      });

      if (!current) {
        return NextResponse.json({
          success: true,
          data: { isPeriodic: false },
        });
      }

      const [prev, next] = await Promise.all([
        findNeighbor(session.user.id, current.kind, current.periodKey, "prev"),
        findNeighbor(session.user.id, current.kind, current.periodKey, "next"),
      ]);

      return NextResponse.json({
        success: true,
        data: {
          isPeriodic: true,
          kind: current.kind,
          periodKey: current.periodKey,
          prev,
          next,
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to resolve neighbors";
      const isAuthError = message.toLowerCase().includes("auth");
      const status = isAuthError ? 401 : 500;

      // Only genuine failures are worth an error-level log; unauthenticated
      // pokes are expected noise.
      if (status === 500) {
        logger.error({
          layer: "periodic",
          event: "neighbors:caught",
          summary: "neighbors failed — 500",
          error,
        });
      }
      return NextResponse.json(
        {
          success: false,
          error: {
            code: isAuthError ? "UNAUTHORIZED" : "INTERNAL_ERROR",
            message,
          },
        },
        { status }
      );
    }
  });
}

async function findNeighbor(
  ownerId: string,
  kind: string,
  periodKey: string,
  direction: "prev" | "next"
): Promise<NeighborNote | null> {
  const row = await prisma.periodicNoteIndex.findFirst({
    where: {
      ownerId,
      kind,
      periodKey: direction === "prev" ? { lt: periodKey } : { gt: periodKey },
      // Skip notes that have been trashed — the index row survives soft-delete.
      content: { deletedAt: null },
    },
    orderBy: { periodKey: direction === "prev" ? "desc" : "asc" },
    select: {
      periodKey: true,
      content: { select: { id: true, title: true } },
    },
  });

  if (!row?.content) return null;
  return {
    id: row.content.id,
    title: row.content.title,
    periodKey: row.periodKey,
  };
}
