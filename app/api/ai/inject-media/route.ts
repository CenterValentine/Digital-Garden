/**
 * POST /api/ai/inject-media
 *
 * Inject a generated media node (audio/image) into a target content's TipTap
 * sidecar note. Any content type is valid (all carry a NotePayload). Placement:
 *   - blank note            → just drop the media in (no AI, no prompt needed).
 *   - non-blank OR an instruction → an AI picks the best insertion point
 *     (and an optional caption) based on the note's block layout + instruction.
 * Falls back to appending at the end if the AI route is unavailable or errors.
 *
 * Body: {
 *   targetContentId: string,
 *   media: { kind:"audio"|"image", url, contentId?, mimeType?, filename?, alt?, durationSeconds? },
 *   instruction?: string,
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { prisma } from "@/lib/database/client";
import type { Prisma } from "@/lib/database/generated/prisma";
import type { JSONContent } from "@tiptap/core";
import { extractSearchTextFromTipTap } from "@/lib/domain/content";

interface InjectMedia {
  kind: "audio" | "image";
  url: string;
  contentId?: string | null;
  mimeType?: string | null;
  filename?: string | null;
  alt?: string | null;
  durationSeconds?: number | null;
}

/** Build the TipTap node for the media being injected. */
function mediaNode(media: InjectMedia): JSONContent {
  if (media.kind === "audio") {
    return {
      type: "audioEmbed",
      attrs: {
        // Every block instance needs a unique blockId. Without it the editor's
        // node-view factory auto-assigns one via a synchronous dispatch DURING
        // render, which corrupts the view and crashes the panel on load.
        blockId: crypto.randomUUID(),
        src: media.url,
        filename: media.filename ?? "Audio",
        mimeType: media.mimeType ?? null,
        durationSeconds: media.durationSeconds ?? null,
        autoplayOnFlip: false,
      },
    };
  }
  return {
    type: "image",
    attrs: {
      src: media.url,
      alt: media.alt ?? media.filename ?? "Image",
      contentId: media.contentId ?? null,
      source: "ai-generated",
    },
  };
}

function paragraph(text: string): JSONContent {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

/** True when a doc has no meaningful content (empty / only blank paragraphs). */
function isBlankDoc(doc: JSONContent | null): boolean {
  if (!doc?.content || doc.content.length === 0) return true;
  return doc.content.every(
    (b) => b.type === "paragraph" && (!b.content || b.content.length === 0),
  );
}

/** Short text preview of a top-level block, for the placement prompt. */
function blockPreview(block: JSONContent): string {
  const collect = (n: JSONContent): string =>
    (typeof n.text === "string" ? n.text : "") +
    (Array.isArray(n.content) ? n.content.map(collect).join("") : "");
  return collect(block).replace(/\s+/g, " ").trim().slice(0, 80);
}

/** Ask the model where to drop the media + an optional caption. */
async function resolvePlacement(
  userId: string,
  blocks: JSONContent[],
  media: InjectMedia,
  instruction: string | undefined,
): Promise<{ insertAfterIndex: number; captionText: string }> {
  const fallback = { insertAfterIndex: blocks.length - 1, captionText: "" };
  try {
    const [{ generateObject }, { resolvePrimaryRoute }, { resolveChatModelFromConnection }] =
      await Promise.all([
        import("ai"),
        import("@/lib/domain/ai/features/router"),
        import("@/lib/domain/ai/providers/registry"),
      ]);
    const route = await resolvePrimaryRoute(userId, "chat");
    if (!route) return fallback;
    const model = await resolveChatModelFromConnection(route.connection, route.modelId);

    const blockList = blocks
      .map((b, i) => `${i}: <${b.type}> ${blockPreview(b)}`)
      .join("\n");
    const { object } = await generateObject({
      model,
      schema: z.object({
        insertAfterIndex: z
          .number()
          .int()
          .describe(
            "Index of the block to insert the media AFTER. -1 = before all blocks; (N-1) = at the end.",
          ),
        captionText: z
          .string()
          .describe("Optional short caption to place with the media. Empty string for none."),
      }),
      prompt:
        `Place a ${media.kind} clip into a note. The note's top-level blocks:\n${blockList}\n\n` +
        `User instruction: ${instruction?.trim() || "(none — choose the most relevant spot based on the layout)"}\n\n` +
        `Return the block index to insert the media AFTER and an optional caption.`,
    });
    const idx = Math.max(-1, Math.min(object.insertAfterIndex, blocks.length - 1));
    return { insertAfterIndex: idx, captionText: object.captionText ?? "" };
  } catch {
    return fallback;
  }
}

const bodySchema = z.object({
  targetContentId: z.string().min(1),
  media: z.object({
    kind: z.enum(["audio", "image"]),
    url: z.string().min(1),
    // nullish (not optional): the cards send `null` for absent values, and
    // z.optional() rejects null — which was failing every audio inject.
    contentId: z.string().nullish(),
    mimeType: z.string().nullish(),
    filename: z.string().nullish(),
    alt: z.string().nullish(),
    durationSeconds: z.number().nullish(),
  }),
  instruction: z.string().nullish(),
});

export async function POST(request: NextRequest) {
  let userId: string;
  try {
    const session = await requireAuth();
    userId = session.user.id;
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });
  }
  const { targetContentId, media, instruction } = parsed.data;

  // Ownership-scoped target + its current note.
  const target = await prisma.contentNode.findFirst({
    where: { id: targetContentId, ownerId: userId, deletedAt: null },
    include: { notePayload: { select: { tiptapJson: true } } },
  });
  if (!target) {
    return NextResponse.json({ success: false, error: "Target not found" }, { status: 404 });
  }

  const existing = (target.notePayload?.tiptapJson as JSONContent | null) ?? null;
  const node = mediaNode(media);

  let newContent: JSONContent[];
  if (isBlankDoc(existing)) {
    // Blank note → just drop it in (+ instruction as a caption if provided).
    newContent = [node, ...(instruction?.trim() ? [paragraph(instruction.trim())] : [])];
  } else {
    const blocks = existing!.content ?? [];
    const { insertAfterIndex, captionText } = await resolvePlacement(
      userId,
      blocks,
      media,
      instruction,
    );
    const inserted: JSONContent[] = [node, ...(captionText.trim() ? [paragraph(captionText.trim())] : [])];
    const at = insertAfterIndex + 1; // insert AFTER the chosen block
    newContent = [...blocks.slice(0, at), ...inserted, ...blocks.slice(at)];
  }

  const doc: JSONContent = { type: "doc", content: newContent };
  const searchText = extractSearchTextFromTipTap(doc);
  const wordCount = searchText.split(/\s+/).filter(Boolean).length;
  const metadata = {
    wordCount,
    characterCount: searchText.length,
    readingTime: Math.ceil(wordCount / 200),
  };

  await prisma.notePayload.upsert({
    where: { contentId: targetContentId },
    update: { tiptapJson: doc as unknown as Prisma.InputJsonValue, searchText, metadata },
    create: {
      contentId: targetContentId,
      tiptapJson: doc as unknown as Prisma.InputJsonValue,
      searchText,
      metadata,
    },
  });

  return NextResponse.json({
    success: true,
    data: { targetContentId, title: target.title },
  });
}
