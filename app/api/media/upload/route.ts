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
import crypto from "crypto";

const ALLOWED_TYPES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "image/avif", "image/svg+xml",
]);

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Only image files are allowed (JPEG, PNG, GIF, WebP, AVIF, SVG)" },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: "Image must be under 10 MB" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const key = `block-media/${session.user.id}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`;

    const provider = await getUserStorageProvider(session.user.id);
    const url = await provider.uploadFile(key, buffer, file.type);

    return NextResponse.json({ url });
  } catch (err) {
    console.error("[media/upload]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 }
    );
  }
}
