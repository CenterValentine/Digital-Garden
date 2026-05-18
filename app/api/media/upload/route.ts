/**
 * POST /api/media/upload
 *
 * Lightweight image upload for block properties (hero, gallery cover, etc.).
 * Accepts multipart/form-data with a "file" field.
 * Returns { url: string } — the public URL for the uploaded image.
 *
 * Unlike /api/content/upload/simple, this does NOT create a ContentNode.
 * It is purely for resolving image URLs to store in block attributes.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { getUserStorageProvider } from "@/lib/infrastructure/storage";
import { logger } from "@/lib/core/logger";
import { withRouteTrace } from "@/lib/core/logger/route-trace";
import { withSpan } from "@/lib/core/logger/span";
import { spanPayload } from "@/lib/core/logger/span-payload";
import crypto from "crypto";

const ALLOWED_TYPES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "image/avif", "image/svg+xml",
]);

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: "/api/media/upload" }, async () => {
    try {
      const session = await requireAuth();

      const formData = await request.formData();
      const file = formData.get("file") as File | null;

      if (!file) {
        logger.warn({
          layer: "storage",
          event: "media_upload:rejected",
          summary: "file missing",
          attrs: { reason: "validation_error" },
        });
        return NextResponse.json({ error: "file is required" }, { status: 400 });
      }

      if (!ALLOWED_TYPES.has(file.type)) {
        logger.warn({
          layer: "storage",
          event: "media_upload:rejected",
          summary: "disallowed mime type",
          attrs: { mime_type: file.type, file_name: file.name },
        });
        return NextResponse.json(
          { error: "Only image files are allowed (JPEG, PNG, GIF, WebP, AVIF, SVG)" },
          { status: 400 },
        );
      }

      if (file.size > MAX_SIZE_BYTES) {
        logger.warn({
          layer: "storage",
          event: "media_upload:rejected",
          summary: "file exceeds size limit",
          attrs: { size_bytes: file.size, limit_bytes: MAX_SIZE_BYTES },
        });
        return NextResponse.json(
          { error: "Image must be under 10 MB" },
          { status: 400 },
        );
      }

      return withSpan(
        { layer: "storage", name: "media:upload" },
        {
          summary: "block-media image upload",
          attrs: {
            mime_type: file.type,
            size_bytes: file.size,
            file_name: file.name,
          },
        },
        async (span) => {
          const buffer = Buffer.from(await file.arrayBuffer());
          const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
          const key = `block-media/${session.user.id}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`;

          const provider = await getUserStorageProvider(session.user.id);
          const url = await provider.uploadFile(key, buffer, file.type);

          span.attr("storage_key", key);
          await spanPayload(span, "upload_metadata", {
            key,
            url,
            sizeBytes: file.size,
            mimeType: file.type,
            originalName: file.name,
          });

          return NextResponse.json({ url });
        },
      );
    } catch (err) {
      logger.error({
        layer: "storage",
        event: "media_upload:caught",
        summary: "media upload handler caught",
        error: err,
      });
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Upload failed" },
        { status: 500 },
      );
    }
  });
}
