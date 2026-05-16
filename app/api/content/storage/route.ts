/**
 * Storage Provider Configuration API
 *
 * GET  /api/content/storage - List storage configurations
 * POST /api/content/storage - Create storage configuration
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import type { Prisma } from "@/lib/database/generated/prisma";
import type {
  CreateStorageConfigRequest,
  R2Config,
  S3Config,
  VercelConfig,
  StorageConfig,
} from "@/lib/domain/content/api-types";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/content/storage";

// ============================================================
// GET /api/content/storage - List Storage Configurations
// ============================================================

export async function GET(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );

      const rawConfigs = await withSpan(
        { layer: "storage", name: "configs_list" },
        undefined,
        async (span) => {
          const result = await prisma.storageProviderConfig.findMany({
            where: { userId: session.user.id },
            select: {
              id: true,
              provider: true,
              isDefault: true,
              displayName: true,
              isActive: true,
              config: true,
              createdAt: true,
              updatedAt: true,
            },
            orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
          });
          span.attr("count", result.length).summary(`${result.length} configs`);
          return result;
        },
      );

      // Sanitize configs — remove sensitive credentials, keep display info
      const configs = rawConfigs.map((config) => {
        const sanitizedConfig = sanitizeConfig(
          config.provider as "r2" | "s3" | "vercel",
          config.config as unknown as StorageConfig
        );

        return {
          id: config.id,
          provider: config.provider,
          isDefault: config.isDefault,
          displayName: config.displayName,
          isActive: config.isActive,
          config: sanitizedConfig,
          createdAt: config.createdAt,
          updatedAt: config.updatedAt,
        };
      });

      return NextResponse.json({
        success: true,
        data: {
          configs,
          count: configs.length,
        },
      });
    } catch (error) {
      logger.error({
        layer: "storage",
        event: "configs_list:caught",
        summary: "GET caught — translated to 500",
        error,
      });
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "SERVER_ERROR",
            message: "Failed to fetch storage configurations",
          },
        },
        { status: 500 }
      );
    }
  });
}

// ============================================================
// POST /api/content/storage - Create Storage Configuration
// ============================================================

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const body = (await request.json()) as CreateStorageConfigRequest;

      const { provider, displayName, config, isDefault } = body;

      if (!provider || !config) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "provider and config are required",
            },
          },
          { status: 400 }
        );
      }

      const validProviders = ["r2", "s3", "vercel"];
      if (!validProviders.includes(provider)) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: `Invalid provider. Must be one of: ${validProviders.join(", ")}`,
            },
          },
          { status: 400 }
        );
      }

      const validationError = validateProviderConfig(provider, config);
      if (validationError) {
        return NextResponse.json(
          {
            success: false,
            error: { code: "VALIDATION_ERROR", message: validationError },
          },
          { status: 400 }
        );
      }

      const existing = await prisma.storageProviderConfig.findFirst({
        where: {
          userId: session.user.id,
          provider,
        },
      });

      if (existing) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "CONFLICT",
              message: `Configuration for ${provider} already exists`,
            },
          },
          { status: 409 }
        );
      }

      if (isDefault) {
        await prisma.storageProviderConfig.updateMany({
          where: { userId: session.user.id, isDefault: true },
          data: { isDefault: false },
        });
      }

      // Note: `config` contains credentials and is NOT logged in attrs.
      const newConfig = await withSpan(
        { layer: "storage", name: "config_create" },
        { attrs: { provider, default: isDefault ?? false } },
        async (span) => {
          const created = await prisma.storageProviderConfig.create({
            data: {
              userId: session.user.id,
              provider,
              displayName: displayName || `${provider.toUpperCase()} Storage`,
              config: config as unknown as Prisma.InputJsonValue,
              isDefault: isDefault || false,
              isActive: true,
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
          span.attr("config_id", created.id);
          return created;
        },
      );

      return NextResponse.json(
        {
          success: true,
          data: newConfig,
        },
        { status: 201 }
      );
    } catch (error) {
      logger.error({
        layer: "storage",
        event: "config_create:caught",
        summary: "POST caught — translated to 500",
        error,
      });
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "SERVER_ERROR",
            message: "Failed to create storage configuration",
          },
        },
        { status: 500 }
      );
    }
  });
}

// ============================================================
// SANITIZATION HELPERS
// ============================================================

function sanitizeConfig(
  provider: "r2" | "s3" | "vercel",
  config: StorageConfig
): Record<string, unknown> {
  if (provider === "r2") {
    return {
      bucket: ("bucket" in config && config.bucket) || null,
      endpoint: ("endpoint" in config && config.endpoint) || null,
    };
  } else if (provider === "s3") {
    return {
      bucket: ("bucket" in config && config.bucket) || null,
      region: ("region" in config && config.region) || null,
    };
  } else if (provider === "vercel") {
    return {};
  }

  return {};
}

// ============================================================
// VALIDATION HELPERS
// ============================================================

function validateProviderConfig(
  provider: "r2" | "s3" | "vercel",
  config: StorageConfig
): string | null {
  if (provider === "r2") {
    const r2Config = config as R2Config;
    if (
      !r2Config.accountId ||
      !r2Config.accessKeyId ||
      !r2Config.secretAccessKey ||
      !r2Config.bucket
    ) {
      return "R2 requires: accountId, accessKeyId, secretAccessKey, bucket";
    }
  } else if (provider === "s3") {
    const s3Config = config as S3Config;
    if (
      !s3Config.region ||
      !s3Config.accessKeyId ||
      !s3Config.secretAccessKey ||
      !s3Config.bucket
    ) {
      return "S3 requires: region, accessKeyId, secretAccessKey, bucket";
    }
  } else if (provider === "vercel") {
    const vercelConfig = config as VercelConfig;
    if (!vercelConfig.token) {
      return "Vercel Blob requires: token";
    }
  }

  return null;
}
