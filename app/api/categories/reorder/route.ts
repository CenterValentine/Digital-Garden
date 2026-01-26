import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/middleware";
import { prisma } from "@/lib/database/client";
import type { ApiResponse, ApiError } from "@/lib/auth/types";

interface ReorderRequest {
  categoryId: string;
  newDisplayOrder: number;
  beforeOrder?: number | null; // Optional: order of item before this position
  afterOrder?: number | null; // Optional: order of item after this position
}

/**
 * PATCH /api/categories/reorder
 * Reorder a category by updating displayOrder
 * Handles conflicts by bumping conflicting items
 */
export async function PATCH(
  request: NextRequest
): Promise<NextResponse<ApiResponse<{ success: boolean }>>> {
  try {
    const session = await requireRole("admin"); // Admin or owner can reorder
    const body: ReorderRequest = await request.json();

    const { categoryId, newDisplayOrder, beforeOrder, afterOrder } = body;

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

    // Verify category belongs to user
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

    // Check for conflicts (another category with same displayOrder)
    const conflicting = await prisma.category.findFirst({
      where: {
        displayOrder: newDisplayOrder,
        ownerId: session.user.id,
        id: { not: categoryId },
      },
    });

    if (conflicting) {
      // Option: Bump conflicting item down by 1
      // This ensures smooth drag-and-drop behavior
      await prisma.category.update({
        where: { id: conflicting.id },
        data: { displayOrder: newDisplayOrder + 1 },
      });
    }

    // Update the category's displayOrder
    await prisma.category.update({
      where: { id: categoryId },
      data: { displayOrder: newDisplayOrder },
    });

    return NextResponse.json(
      {
        success: true,
        data: { success: true },
      } as ApiResponse<{ success: boolean }>,
      { status: 200 }
    );
  } catch (error) {
    console.error("Category reorder error:", error);
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
}

/**
 * Calculate new displayOrder from before/after positions
 * Used by drag-and-drop UI to calculate midpoint
 */
function calculateNewOrder(
  beforeOrder: number | null,
  afterOrder: number | null
): number {
  if (beforeOrder === null && afterOrder === null) {
    return 0; // First position
  }
  if (beforeOrder === null) {
    return Math.max(0, afterOrder! - 10); // Before first item
  }
  if (afterOrder === null) {
    return beforeOrder + 10; // After last item
  }
  // Insert between two items
  return Math.floor((beforeOrder + afterOrder) / 2);
}
