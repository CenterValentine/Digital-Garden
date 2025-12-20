import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/middleware";
import { prisma } from "@/lib/db/prisma";
import type { ApiResponse, ApiError } from "@/lib/auth/types";

interface ReorderRequest {
  documentId: string;
  newDisplayOrder: number;
  categoryId?: string | null; // If moving within a category
  parentId?: string | null; // If moving within a parent document
}

/**
 * PATCH /api/documents/reorder
 * Reorder a document within its category or parent
 * Handles conflicts by bumping conflicting items
 */
export async function PATCH(
  request: NextRequest
): Promise<NextResponse<ApiResponse<{ success: boolean }>>> {
  try {
    const session = await requireRole("admin"); // Admin or owner can reorder
    const body: ReorderRequest = await request.json();

    const { documentId, newDisplayOrder, categoryId, parentId } = body;

    if (!documentId || newDisplayOrder === undefined) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_REQUEST",
            message: "documentId and newDisplayOrder are required",
          },
        } as ApiResponse<never>,
        { status: 400 }
      );
    }

    // Verify document belongs to user
    const document = await prisma.structuredDocument.findFirst({
      where: {
        id: documentId,
        ownerId: session.user.id,
      },
    });

    if (!document) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Document not found or access denied",
          },
        } as ApiResponse<never>,
        { status: 404 }
      );
    }

    // Build conflict check query based on context
    const conflictWhere: any = {
      displayOrder: newDisplayOrder,
      ownerId: session.user.id,
      id: { not: documentId },
    };

    if (categoryId) {
      conflictWhere.categoryId = categoryId;
    } else if (parentId) {
      conflictWhere.parentId = parentId;
    } else {
      // Root level documents (no category, no parent)
      conflictWhere.categoryId = null;
      conflictWhere.parentId = null;
    }

    // Check for conflicts
    const conflicting = await prisma.structuredDocument.findFirst({
      where: conflictWhere,
    });

    if (conflicting) {
      // Bump conflicting item down by 1
      await prisma.structuredDocument.update({
        where: { id: conflicting.id },
        data: { displayOrder: newDisplayOrder + 1 },
      });
    }

    // Update the document's displayOrder and context
    const updateData: any = { displayOrder: newDisplayOrder };
    if (categoryId !== undefined) {
      updateData.categoryId = categoryId;
    }
    if (parentId !== undefined) {
      updateData.parentId = parentId;
    }

    await prisma.structuredDocument.update({
      where: { id: documentId },
      data: updateData,
    });

    return NextResponse.json(
      {
        success: true,
        data: { success: true },
      } as ApiResponse<{ success: boolean }>,
      { status: 200 }
    );
  } catch (error) {
    console.error("Document reorder error:", error);
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
