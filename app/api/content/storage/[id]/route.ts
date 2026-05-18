/**
 * Storage Provider Configuration API - Individual Operations
 *
 * GET    /api/content/storage/[id] - Get storage configuration
 * PATCH  /api/content/storage/[id] - Update storage configuration
 * DELETE /api/content/storage/[id] - Delete storage configuration
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import type { UpdateStorageConfigRequest } from "@/lib/domain/content/api-types";
import type { Prisma } from "@/lib/database/generated/prisma";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/content/storage/[id]";

type Params = Promise<{ id: string }>;

// ============================================================
// GET /api/content/storage/[id] - Get Storage Configuration
// ============================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Params }
) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
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
            error: { code: "NOT_FOUND", message: "Storage configuration not found" },
          },
          { status: 404 }
        );
      }

      const ownerCheck = await prisma.storageProviderConfig.findFirst({
        where: { id, userId: session.user.id },
      });

      if (!ownerCheck) {
        return NextResponse.json(
          {
            success: false,
            error: { code: "FORBIDDEN", message: "Access denied" },
          },
          { status: 403 }
        );
      }

      return NextResponse.json({
        success: true,
        data: config,
      });
    } catch (error) {
      logger.error({
        layer: "storage",
        event: "config_read:caught",
        summary: "GET caught — translated to 500",
        error,
      });
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
  });
}

// ============================================================
// PATCH /api/content/storage/[id] - Update Storage Configuration
// ============================================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Params }
) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const { id } = await params;
      const body = (await request.json()) as UpdateStorageConfigRequest;

      const { displayName, config, isDefault, isActive } = body;

      const existing = await prisma.storageProviderConfig.findUnique({
        where: { id },
      });

      if (!existing) {
        return NextResponse.json(
          {
            success: false,
            error: { code: "NOT_FOUND", message: "Storage configuration not found" },
          },
          { status: 404 }
        );
      }

      if (existing.userId !== session.user.id) {
        return NextResponse.json(
          {
            success: false,
            error: { code: "FORBIDDEN", message: "Access denied" },
          },
          { status: 403 }
        );
      }

      if (isDefault === true) {
        await prisma.storageProviderConfig.updateMany({
          where: {
            userId: session.user.id,
            isDefault: true,
            id: { not: id },
          },
          data: { isDefault: false },
        });
      }

      const updated = await withSpan(
        { layer: "storage", name: "config_update" },
        { attrs: { config_id: id, provider: existing.provider } },
        async () =>
          prisma.storageProviderConfig.update({
            where: { id },
            data: {
              displayName: displayName ?? existing.displayName,
              config: (config ?? existing.config) as Prisma.InputJsonValue,
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
          }),
      );

      return NextResponse.json({
        success: true,
        data: updated,
      });
    } catch (error) {
      logger.error({
        layer: "storage",
        event: "config_update:caught",
        summary: "PATCH caught — translated to 500",
        error,
      });
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
  });
}

// ============================================================
// DELETE /api/content/storage/[id] - Delete Storage Configuration
// ============================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Params }
) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const { id } = await params;

      const existing = await prisma.storageProviderConfig.findUnique({
        where: { id },
      });

      if (!existing) {
        return NextResponse.json(
          {
            success: false,
            error: { code: "NOT_FOUND", message: "Storage configuration not found" },
          },
          { status: 404 }
        );
      }

      if (existing.userId !== session.user.id) {
        return NextResponse.json(
          {
            success: false,
            error: { code: "FORBIDDEN", message: "Access denied" },
          },
          { status: 403 }
        );
      }

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

      const filesUsingProvider = await prisma.filePayload.count({
        where: {
          storageProvider: existing.provider,
          content: { ownerId: session.user.id },
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

      await withSpan(
        { layer: "storage", name: "config_delete" },
        { attrs: { config_id: id, provider: existing.provider } },
        async () =>
          prisma.storageProviderConfig.delete({
            where: { id },
          }),
      );

      return NextResponse.json({
        success: true,
        data: {
          id,
          message: "Storage configuration deleted successfully",
        },
      });
    } catch (error) {
      logger.error({
        layer: "storage",
        event: "config_delete:caught",
        summary: "DELETE caught — translated to 500",
        error,
      });
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
  });
}
