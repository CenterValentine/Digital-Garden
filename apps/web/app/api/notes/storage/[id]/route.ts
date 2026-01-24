/**
 * Storage Provider Configuration API - Individual Operations
 *
 * GET    /api/notes/storage/[id] - Get storage configuration
 * PATCH  /api/notes/storage/[id] - Update storage configuration
 * DELETE /api/notes/storage/[id] - Delete storage configuration
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/middleware";
import type { UpdateStorageConfigRequest } from "@/lib/content/api-types";

type Params = Promise<{ id: string }>;

// ============================================================
// GET /api/notes/storage/[id] - Get Storage Configuration
// ============================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    const config = await prisma.storageProviderConfig.findUnique({
      where: { id },
      select: {
        id: true,
        provider: true,
        displayName: true,
        config: true,
        isDefault: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!config) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Storage configuration not found",
          },
        },
        { status: 404 }
      );
    }

    // Check ownership via userId join
    const ownerCheck = await prisma.storageProviderConfig.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!ownerCheck) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Access denied",
          },
        },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      data: config,
    });
  } catch (error) {
    console.error(`GET /api/notes/storage/[id] error:`, error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: "Failed to fetch storage configuration",
        },
      },
      { status: 500 }
    );
  }
}

// ============================================================
// PATCH /api/notes/storage/[id] - Update Storage Configuration
// ============================================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = (await request.json()) as UpdateStorageConfigRequest;

    const { displayName, config, isDefault, isActive } = body;

    // Fetch existing config
    const existing = await prisma.storageProviderConfig.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Storage configuration not found",
          },
        },
        { status: 404 }
      );
    }

    // Check ownership
    if (existing.userId !== session.user.id) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Access denied",
          },
        },
        { status: 403 }
      );
    }

    // If setting as default, unset other defaults
    if (isDefault === true) {
      await prisma.storageProviderConfig.updateMany({
        where: {
          userId: session.user.id,
          isDefault: true,
          id: { not: id },
        },
        data: {
          isDefault: false,
        },
      });
    }

    // Update configuration
    const updated = await prisma.storageProviderConfig.update({
      where: { id },
      data: {
        displayName: displayName ?? existing.displayName,
        config: (config ?? existing.config) as any,
        isDefault: isDefault ?? existing.isDefault,
        isActive: isActive ?? existing.isActive,
      },
      select: {
        id: true,
        provider: true,
        displayName: true,
        isDefault: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error(`PATCH /api/notes/storage/[id] error:`, error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: "Failed to update storage configuration",
        },
      },
      { status: 500 }
    );
  }
}

// ============================================================
// DELETE /api/notes/storage/[id] - Delete Storage Configuration
// ============================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    // Fetch existing config
    const existing = await prisma.storageProviderConfig.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Storage configuration not found",
          },
        },
        { status: 404 }
      );
    }

    // Check ownership
    if (existing.userId !== session.user.id) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Access denied",
          },
        },
        { status: 403 }
      );
    }

    // Check if this is the default provider
    if (existing.isDefault) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message:
              "Cannot delete default storage provider. Set another provider as default first.",
          },
        },
        { status: 400 }
      );
    }

    // Check if files are using this provider
    const filesUsingProvider = await prisma.filePayload.count({
      where: {
        storageProvider: existing.provider,
        content: {
          ownerId: session.user.id,
        },
      },
    });

    if (filesUsingProvider > 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: `Cannot delete storage provider. ${filesUsingProvider} file(s) are still using it.`,
          },
        },
        { status: 400 }
      );
    }

    // Delete configuration
    await prisma.storageProviderConfig.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      data: {
        id,
        message: "Storage configuration deleted successfully",
      },
    });
  } catch (error) {
    console.error(`DELETE /api/notes/storage/[id] error:`, error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: "Failed to delete storage configuration",
        },
      },
      { status: 500 }
    );
  }
}
