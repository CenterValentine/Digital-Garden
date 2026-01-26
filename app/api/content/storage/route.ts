/**
 * Storage Provider Configuration API
 *
 * GET  /api/content/storage - List storage configurations
 * POST /api/content/storage - Create storage configuration
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import type {
  CreateStorageConfigRequest,
  R2Config,
  S3Config,
  VercelConfig,
  StorageConfig,
} from "@/lib/domain/content/api-types";

// ============================================================
// GET /api/content/storage - List Storage Configurations
// ============================================================

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();

    const rawConfigs = await prisma.storageProviderConfig.findMany({
      where: {
        userId: session.user.id,
      },
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

    // Sanitize configs - remove sensitive credentials, keep display info
    const configs = rawConfigs.map((config) => {
      const sanitizedConfig = sanitizeConfig(config.provider, config.config as any);

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
    console.error("GET /api/content/storage error:", error);
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
}

// ============================================================
// POST /api/content/storage - Create Storage Configuration
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = (await request.json()) as CreateStorageConfigRequest;

    const { provider, displayName, config, isDefault } = body;

    // Validation
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

    // Validate provider type
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

    // Validate required config fields
    const validationError = validateProviderConfig(provider, config);
    if (validationError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: validationError,
          },
        },
        { status: 400 }
      );
    }

    // Check if configuration already exists
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

    // If setting as default, unset other defaults
    if (isDefault) {
      await prisma.storageProviderConfig.updateMany({
        where: {
          userId: session.user.id,
          isDefault: true,
        },
        data: {
          isDefault: false,
        },
      });
    }

    // Create configuration
    const newConfig = await prisma.storageProviderConfig.create({
      data: {
        userId: session.user.id,
        provider,
        displayName: displayName || `${provider.toUpperCase()} Storage`,
        config: config as any,
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

    return NextResponse.json(
      {
        success: true,
        data: newConfig,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/content/storage error:", error);
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
}

// ============================================================
// SANITIZATION HELPERS
// ============================================================

/**
 * Sanitize config for safe display - remove credentials, keep display info
 */
function sanitizeConfig(
  provider: "r2" | "s3" | "vercel",
  config: any
): Record<string, any> {
  if (provider === "r2") {
    return {
      bucket: config.bucket || null,
      endpoint: config.endpoint || null,
      // Omit: accountId, accessKeyId, secretAccessKey
    };
  } else if (provider === "s3") {
    return {
      bucket: config.bucket || null,
      region: config.region || null,
      // Omit: accessKeyId, secretAccessKey
    };
  } else if (provider === "vercel") {
    return {
      // Vercel doesn't have non-sensitive config to show
      // Omit: token
    };
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

    // Access config values like this:
    // const { accountId, accessKeyId, secretAccessKey, bucket } = r2Config;
    // Or: r2Config.accountId, r2Config.accessKeyId, etc.
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

    // Access config values like this:
    // const { region, accessKeyId, secretAccessKey, bucket } = s3Config;
  } else if (provider === "vercel") {
    const vercelConfig = config as VercelConfig;
    if (!vercelConfig.token) {
      return "Vercel Blob requires: token";
    }

    // Access config values like this:
    // const { token } = vercelConfig;
  }

  return null;
}
