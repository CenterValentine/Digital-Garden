import { NextRequest, NextResponse } from "next/server";
import { requireBrowserExtensionBearerAuth } from "@/lib/domain/browser-bookmarks/http";
import { prisma } from "@/lib/database/client";
import { logger } from "@/lib/core/logger";

const MAX_RESULTS = 20;

function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const lowered = message.toLowerCase();
  const status = lowered.includes("token") || lowered.includes("auth") ? 401 : 500;
  return NextResponse.json({ success: false, error: { message } }, { status });
}

export async function GET(request: NextRequest) {
  try {
    const token = await requireBrowserExtensionBearerAuth(request);
    const { searchParams } = request.nextUrl;

    const url = searchParams.get("url");
    const excludeResourceId = searchParams.get("excludeResourceId");

    if (!url) throw new Error("url query parameter is required");

    let hostname: string;
    try {
      hostname = new URL(url).hostname;
    } catch {
      throw new Error("Invalid URL");
    }
    if (!hostname) throw new Error("Could not extract hostname from URL");

    const resources = await prisma.webResource.findMany({
      where: {
        userId: token.user.id,
        sourceHostname: hostname,
        ...(excludeResourceId ? { id: { not: excludeResourceId } } : {}),
      },
      select: {
        id: true,
        title: true,
        normalizedUrl: true,
        identityUrl: true,
      },
    });

    if (resources.length === 0) {
      return NextResponse.json({ success: true, data: { items: [], total: 0 } });
    }

    const resourceMap = new Map(resources.map((r) => [r.id, r]));

    const links = await prisma.webResourceContentLink.findMany({
      where: {
        userId: token.user.id,
        webResourceId: { in: resources.map((r) => r.id) },
      },
      include: {
        content: {
          select: {
            id: true,
            title: true,
            contentType: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: MAX_RESULTS,
    });

    const items = links.map((link) => {
      const resource = resourceMap.get(link.webResourceId);
      return {
        contentId: link.content.id,
        contentTitle: link.content.title,
        contentType: link.content.contentType,
        urlTitle: resource?.title ?? null,
        normalizedUrl: resource?.normalizedUrl ?? resource?.identityUrl ?? null,
      };
    });

    return NextResponse.json({ success: true, data: { items, total: items.length } });
  } catch (error) {
    logger.error({ layer: "browser_ext", event: "domain_associations:caught", summary: "GET caught", error });
    return errorResponse(error, "Failed to load domain associations");
  }
}
