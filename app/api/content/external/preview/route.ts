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
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/content/external/preview";

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const body = await request.json();
      const { url } = body;

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

      // Fetch user settings — needed for previewsEnabled, allowlist, http.
      const externalSettings = await withSpan(
        { layer: "content", name: "settings_read" },
        { summary: "external preview settings" },
        async (span) => {
          const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { settings: true },
          });

          type SettingsShape = {
            external?: {
              previewsEnabled?: boolean;
              allowAllDomains?: boolean;
              allowlistedHosts?: string[];
              allowHttp?: boolean;
            };
          };
          const settings = (user?.settings as SettingsShape | null) || {};
          const ext = settings.external || {};
          span.attr("previews_enabled", ext.previewsEnabled ?? false);
          span.attr("allow_all", ext.allowAllDomains ?? false);
          return ext;
        },
      );

      const previewsEnabled = externalSettings.previewsEnabled ?? false;
      if (!previewsEnabled) {
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

      const allowAllDomains = externalSettings.allowAllDomains ?? false;
      const allowlistedHosts = externalSettings.allowlistedHosts || [];
      const allowHttp = externalSettings.allowHttp ?? false;

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

      // Fetch Open Graph metadata. Hostname (not full URL) used as attr — full
      // URL can carry tokens/queries in some flows.
      let ogData: Awaited<ReturnType<typeof fetchOpenGraphData>> = null;
      let fetchThrew = false;
      try {
        ogData = await withSpan(
          { layer: "external", name: "og_fetch" },
          {
            attrs: { host: safeHostname(url) },
            summary: safeHostname(url) ?? "og fetch",
          },
          async (span) => {
            const result = await fetchOpenGraphData(url, {
              timeout: 5000,
              maxSize: 256 * 1024,
              allowCrossDomain: false,
            });
            span.attr("found", Boolean(result));
            if (result) {
              span.attr("has_title", Boolean(result.title));
              span.attr("has_description", Boolean(result.description));
              span.attr("has_image", Boolean(result.imageUrl));
            }
            return result;
          },
        );
      } catch {
        fetchThrew = true;
      }

      if (fetchThrew) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "FETCH_ERROR",
              message: "Failed to fetch Open Graph metadata",
            },
          },
          { status: 500 }
        );
      }

      if (!ogData) {
        let errorMessage = "Failed to fetch Open Graph metadata. ";

        // Detect a common SSL-error class of failure for friendly messaging.
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

      return NextResponse.json({
        success: true,
        data: {
          url,
          metadata: ogData,
          fetchedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error({
        layer: "external",
        event: "preview:caught",
        summary: "preview failed — 500",
        error,
      });
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
  });
}

function safeHostname(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}
