import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/infrastructure/auth/middleware";
import { prisma } from "@/lib/database/client";
import type { ApiResponse } from "@/lib/infrastructure/auth/types";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/categories/reorder";

interface ReorderRequest {
  categoryId: string;
  newDisplayOrder: number;
  beforeOrder?: number | null;
  afterOrder?: number | null;
}

/**
 * PATCH /api/categories/reorder
 * Reorder a category by updating displayOrder.
 * Handles conflicts by bumping conflicting items.
 */
export async function PATCH(
  request: NextRequest
) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup (admin)" },
        async () => requireRole("admin"),
      );
      const body: ReorderRequest = await request.json();

      const { categoryId, newDisplayOrder } = body;

      if (!categoryId || newDisplayOrder === undefined) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "INVALID_REQUEST",
              message: "categoryId and newDisplayOrder are required",
            },
          } as ApiResponse<never>,
          { status: 400 }
        );
      }

      const category = await prisma.category.findFirst({
        where: {
          id: categoryId,
          ownerId: session.user.id,
        },
      });

      if (!category) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Category not found or access denied",
            },
          } as ApiResponse<never>,
          { status: 404 }
        );
      }

      await withSpan(
        { layer: "tree", name: "category_reorder" },
        {
          attrs: { category_id: categoryId, new_order: newDisplayOrder },
          summary: `order=${newDisplayOrder}`,
        },
        async (span) => {
          const conflicting = await prisma.category.findFirst({
            where: {
              displayOrder: newDisplayOrder,
              ownerId: session.user.id,
              id: { not: categoryId },
            },
          });

          if (conflicting) {
            await prisma.category.update({
              where: { id: conflicting.id },
              data: { displayOrder: newDisplayOrder + 1 },
            });
            span.attr("bumped", conflicting.id);
          }

          await prisma.category.update({
            where: { id: categoryId },
            data: { displayOrder: newDisplayOrder },
          });
        },
      );

      return NextResponse.json(
        {
          success: true,
          data: { success: true },
        } as ApiResponse<{ success: boolean }>,
        { status: 200 }
      );
    } catch (error) {
      logger.error({
        layer: "tree",
        event: "category_reorder:caught",
        summary: "reorder failed — 500",
        error,
      });
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: error instanceof Error ? error.message : "An error occurred",
          },
        } as ApiResponse<never>,
        { status: 500 }
      );
    }
  });
}
