/**
 * GET /f/[token] — public file link.
 *
 * Resolves a capability token (FilePayload.publicToken) to the file it names
 * and answers with a 302 to a fresh, short-lived presigned storage URL. No
 * session is required: the token IS the authorization. Anything that can
 * load an image URL — a markdown renderer, a chat input, an <img> tag in
 * Notion or Slack, an AI model handed the link — follows the redirect and
 * gets the bytes, while the bucket itself stays private.
 *
 * Unknown, rotated, trashed and unfinished files all answer 404 with no
 * distinguishing detail, so the route leaks nothing about ids it rejects.
 *
 * Lives outside /api so the link reads as a plain file URL. proxy.ts leaves
 * it alone: "/f" is not a PROTECTED_PREFIX, so no sign-in redirect.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { getUserStorageProvider } from "@/lib/infrastructure/storage";
import { PUBLIC_FILE_TOKEN_PATTERN } from "@/lib/domain/content/file-share-links";
import { logger, withRouteTrace } from "@/lib/core/logger";

const ROUTE_PATH = "/f/[token]";

/** Presigned URL lifetime; the redirect itself is cacheable for a fraction of it. */
const PRESIGN_SECONDS = 3600;
const REDIRECT_CACHE_SECONDS = 600;

type Params = Promise<{ token: string }>;

function notFound(): NextResponse {
  return new NextResponse("Not found", {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: NextRequest, { params }: { params: Params }) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    const { token } = await params;
    if (!PUBLIC_FILE_TOKEN_PATTERN.test(token)) return notFound();

    const file = await prisma.filePayload.findUnique({
      where: { publicToken: token },
      select: {
        contentId: true,
        storageKey: true,
        storageProvider: true,
        uploadStatus: true,
        content: { select: { ownerId: true, deletedAt: true } },
      },
    });
    if (!file || file.uploadStatus !== "ready" || file.content.deletedAt) return notFound();

    try {
      const provider = await getUserStorageProvider(file.content.ownerId, file.storageProvider);
      const url = await provider.generateDownloadUrl(file.storageKey, PRESIGN_SECONDS);
      return NextResponse.redirect(url, {
        status: 302,
        headers: { "Cache-Control": `public, max-age=${REDIRECT_CACHE_SECONDS}` },
      });
    } catch (error) {
      logger.error({
        layer: "storage",
        event: "public_file:presign_failed",
        summary: "presign failed for public file link",
        attrs: { content_id: file.contentId },
        error,
      });
      return new NextResponse("File unavailable", {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      });
    }
  });
}
