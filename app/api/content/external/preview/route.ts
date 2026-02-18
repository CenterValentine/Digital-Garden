/**
 * External Link Preview API
 *
 * POST /api/content/external/preview - Fetch Open Graph metadata for URL
 *
 * Phase 2: ExternalPayload support
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { prisma } from "@/lib/database/client";
import {
  validateExternalUrl,
  isHostnameAllowed,
} from "@/lib/domain/content/external-validation";
import { fetchOpenGraphData } from "@/lib/domain/content/open-graph-fetcher";

// ============================================================
// POST /api/content/external/preview - Fetch Open Graph Metadata
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await request.json();
    const { url } = body;

    // Validate URL is provided
    if (!url || typeof url !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_REQUEST",
            message: "URL is required",
          },
        },
        { status: 400 }
      );
    }

    // Fetch user settings
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { settings: true },
    });

    const settings = (user?.settings as any) || {};
    const externalSettings = settings.external || {};

    console.log("[External Preview API] User settings loaded:", {
      hasSettings: !!user?.settings,
      externalSettings,
    });

    // Check if previews are enabled
    const previewsEnabled = externalSettings.previewsEnabled ?? false;
    if (!previewsEnabled) {
      console.log("[External Preview API] Previews disabled in settings");
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "PREVIEWS_DISABLED",
            message: "Open Graph previews are disabled. Enable them in settings.",
          },
        },
        { status: 403 }
      );
    }

    // Get allowlist and HTTP setting
    const allowAllDomains = externalSettings.allowAllDomains ?? false;
    const allowlistedHosts = externalSettings.allowlistedHosts || [];
    const allowHttp = externalSettings.allowHttp ?? false;

    console.log("[External Preview API] Checking allowlist:", {
      url,
      allowAllDomains,
      allowlistedHosts,
      allowHttp,
    });

    // Validate URL format
    const validation = validateExternalUrl(url, { allowHttp });
    if (!validation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_URL",
            message: validation.error || "Invalid URL",
          },
        },
        { status: 400 }
      );
    }

    // Check hostname allowlist (skip if allowAllDomains is enabled)
    if (!allowAllDomains && !isHostnameAllowed(url, allowlistedHosts)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "HOSTNAME_NOT_ALLOWED",
            message:
              "This hostname is not in your allowlist. Add it in settings or enable 'Allow all domains'.",
          },
        },
        { status: 403 }
      );
    }

    // Fetch Open Graph metadata
    console.log("[External Preview API] Fetching OG data for:", url);

    let ogData;
    try {
      ogData = await fetchOpenGraphData(url, {
        timeout: 5000, // 5 second timeout
        maxSize: 256 * 1024, // 256KB max
        allowCrossDomain: false,
      });
    } catch (fetchError) {
      console.error("[External Preview API] OG fetch threw error:", fetchError);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "FETCH_ERROR",
            message: `Failed to fetch Open Graph metadata: ${fetchError instanceof Error ? fetchError.message : "Unknown error"}`,
          },
        },
        { status: 500 }
      );
    }

    console.log("[External Preview API] OG fetch result:", ogData);

    if (!ogData) {
      console.warn("[External Preview API] OG fetch returned null (no metadata found or fetch failed)");

      // Provide helpful error message based on common issues
      let errorMessage = "Failed to fetch Open Graph metadata. ";

      // Check if this might be an SSL issue (common with Papermart.com and similar sites)
      if (url.toLowerCase().includes('papermart') || url.toLowerCase().includes('.com')) {
        errorMessage += "The site may have SSL certificate issues. In development, you can bypass this by setting NODE_TLS_REJECT_UNAUTHORIZED=0 in your environment. ";
      }

      errorMessage += "The site may not support Open Graph tags, may be blocking requests, or may have connectivity issues.";

      return NextResponse.json(
        {
          success: false,
          error: {
            code: "NO_METADATA",
            message: errorMessage,
          },
        },
        { status: 404 }
      );
    }

    console.log("[External Preview API] Fetched Open Graph data:", {
      url,
      hasTitle: !!ogData.title,
      hasDescription: !!ogData.description,
      hasImage: !!ogData.imageUrl,
    });

    return NextResponse.json({
      success: true,
      data: {
        url,
        metadata: ogData,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("[External Preview API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message:
            error instanceof Error ? error.message : "Internal server error",
        },
      },
      { status: 500 }
    );
  }
}
