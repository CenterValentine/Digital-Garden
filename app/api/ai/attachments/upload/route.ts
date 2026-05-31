/**
 * POST /api/ai/attachments/upload — Session 5b.
 *
 * Chat attachment intake. Accepts multipart/form-data with a "file" field.
 *
 *   - Images → uploaded to object storage (R2/S3/Blob), returned as a
 *     URL the model's vision API can fetch:
 *       { kind: "image", url, mediaType, name, size }
 *   - Text-like files (txt/md/json/csv) → read and returned inline so the
 *     client can fold the content into the prompt (a URL is useless for
 *     text with most providers):
 *       { kind: "text", text, name, size }
 *
 * Binary / unsupported types are rejected (5b-2 adds PDF extraction).
 * Does NOT create a ContentNode — purely resolves attachment data.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { getUserStorageProvider } from "@/lib/infrastructure/storage";
import { DocumentExtractor } from "@/lib/infrastructure/media/document-extractor";
import { prisma } from "@/lib/database/client";
import { generateUniqueSlug } from "@/lib/domain/content/slug";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";
import crypto from "crypto";

/**
 * Create a `referenced` FilePayload ContentNode for an uploaded attachment
 * so it's openable in the content viewer and shows in the file tree once
 * referenced content is revealed. Returns the new node id. Best-effort:
 * on failure the attachment still works (chip just won't be clickable).
 */
async function createReferencedFileNode(
  userId: string,
  file: {
    name: string;
    mediaType: string;
    size: number;
    storageKey: string;
    storageUrl: string;
    buffer: Buffer;
  },
): Promise<string | null> {
  try {
    const slug = await generateUniqueSlug(file.name, userId);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? null;
    const checksum = crypto
      .createHash("sha256")
      .update(file.buffer)
      .digest("hex");
    const node = await prisma.contentNode.create({
      data: {
        ownerId: userId,
        title: file.name,
        slug,
        contentType: "file",
        role: "referenced",
        filePayload: {
          create: {
            fileName: file.name,
            fileExtension: ext,
            mimeType: file.mediaType,
            fileSize: BigInt(file.size),
            checksum,
            storageKey: file.storageKey,
            storageUrl: file.storageUrl,
            uploadStatus: "ready",
            uploadedAt: new Date(),
          },
        },
      },
      select: { id: true },
    });
    return node.id;
  } catch (err) {
    logger.warn({
      layer: "storage",
      event: "attachment_ref_node:failed",
      summary: "failed to create referenced content node for attachment",
      error: err,
    });
    return null;
  }
}

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
]);

// Text-like types inlined into the prompt. Some arrive with odd mime types
// (e.g. .md as application/octet-stream), so we also sniff by extension.
const TEXT_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "text/json",
]);
const TEXT_EXTENSIONS = new Set(["txt", "md", "markdown", "csv", "json", "log"]);

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_TEXT_BYTES = 512 * 1024; // 512 KB raw
const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20 MB
const MAX_INLINED_CHARS = 100_000; // cap what we fold into the prompt

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: "/api/ai/attachments/upload" }, async () => {
    try {
      const session = await requireAuth();
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json({ error: "file is required" }, { status: 400 });
      }

      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      const isImage = IMAGE_TYPES.has(file.type);
      const isText = TEXT_TYPES.has(file.type) || TEXT_EXTENSIONS.has(ext);

      // ── Text-like: upload (for the persisted chip) + return content
      //    (the server inlines it into the model prompt). ──
      if (isText && !isImage) {
        if (file.size > MAX_TEXT_BYTES) {
          return NextResponse.json(
            { error: "Text file must be under 512 KB" },
            { status: 400 },
          );
        }
        const buffer = Buffer.from(await file.arrayBuffer());
        const raw = buffer.toString("utf-8");
        const text =
          raw.length > MAX_INLINED_CHARS
            ? raw.slice(0, MAX_INLINED_CHARS) + "\n…[truncated]"
            : raw;
        const mediaType = file.type || "text/plain";
        const key = `chat-attachments/${session.user.id}/${Date.now()}-${crypto
          .randomBytes(6)
          .toString("hex")}.${ext || "txt"}`;
        const provider = await getUserStorageProvider(session.user.id);
        const url = await provider.uploadFile(key, buffer, mediaType);
        const contentNodeId = await createReferencedFileNode(session.user.id, {
          name: file.name,
          mediaType,
          size: file.size,
          storageKey: key,
          storageUrl: url,
          buffer,
        });
        return NextResponse.json({
          kind: "text",
          url,
          key,
          contentNodeId,
          mediaType,
          text,
          name: file.name,
          size: file.size,
        });
      }

      // ── Image: upload to storage, return a fetchable URL ──
      if (isImage) {
        if (file.size > MAX_IMAGE_BYTES) {
          return NextResponse.json(
            { error: "Image must be under 10 MB" },
            { status: 400 },
          );
        }
        return withSpan(
          { layer: "storage", name: "attachment:upload" },
          {
            summary: "chat image attachment upload",
            attrs: { mime_type: file.type, size_bytes: file.size },
          },
          async (span) => {
            const buffer = Buffer.from(await file.arrayBuffer());
            const safeExt = ext || "png";
            const key = `chat-attachments/${session.user.id}/${Date.now()}-${crypto
              .randomBytes(6)
              .toString("hex")}.${safeExt}`;
            const provider = await getUserStorageProvider(session.user.id);
            const url = await provider.uploadFile(key, buffer, file.type);
            span.attr("storage_key", key);
            const contentNodeId = await createReferencedFileNode(
              session.user.id,
              {
                name: file.name,
                mediaType: file.type,
                size: file.size,
                storageKey: key,
                storageUrl: url,
                buffer,
              },
            );
            return NextResponse.json({
              kind: "image",
              url,
              key,
              contentNodeId,
              mediaType: file.type,
              name: file.name,
              size: file.size,
            });
          },
        );
      }

      // ── PDF: upload (for native document models) + extract text
      //    (fallback for everyone else). Returns both representations so
      //    send-time can pick based on the active model's capability. ──
      const isPdf = file.type === "application/pdf" || ext === "pdf";
      if (isPdf) {
        if (file.size > MAX_PDF_BYTES) {
          return NextResponse.json(
            { error: "PDF must be under 20 MB" },
            { status: 400 },
          );
        }
        return withSpan(
          { layer: "storage", name: "attachment:pdf" },
          { summary: "chat PDF attachment", attrs: { size_bytes: file.size } },
          async (span) => {
            const buffer = Buffer.from(await file.arrayBuffer());
            const key = `chat-attachments/${session.user.id}/${Date.now()}-${crypto
              .randomBytes(6)
              .toString("hex")}.pdf`;
            const provider = await getUserStorageProvider(session.user.id);
            const url = await provider.uploadFile(key, buffer, "application/pdf");

            let text = "";
            try {
              const extractor = new DocumentExtractor(provider);
              const raw = await extractor.extractText(key, "application/pdf");
              text =
                raw.length > MAX_INLINED_CHARS
                  ? raw.slice(0, MAX_INLINED_CHARS) + "\n…[truncated]"
                  : raw;
            } catch (err) {
              logger.warn({
                layer: "storage",
                event: "attachment_pdf_extract:failed",
                summary: "pdf text extraction failed (continuing with url only)",
                error: err,
              });
            }
            span.attr("storage_key", key);
            span.attr("extracted_chars", text.length);
            const contentNodeId = await createReferencedFileNode(
              session.user.id,
              {
                name: file.name,
                mediaType: "application/pdf",
                size: file.size,
                storageKey: key,
                storageUrl: url,
                buffer,
              },
            );
            return NextResponse.json({
              kind: "document",
              url,
              key,
              contentNodeId,
              mediaType: "application/pdf",
              text,
              name: file.name,
              size: file.size,
            });
          },
        );
      }

      return NextResponse.json(
        {
          error:
            "Unsupported attachment type. Images, PDFs, and text files (txt, md, csv, json) are supported.",
        },
        { status: 415 },
      );
    } catch (err) {
      logger.error({
        layer: "storage",
        event: "attachment_upload:caught",
        summary: "chat attachment upload caught",
        error: err,
      });
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Upload failed" },
        { status: 500 },
      );
    }
  });
}
