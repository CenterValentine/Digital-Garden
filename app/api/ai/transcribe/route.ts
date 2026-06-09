/**
 * POST /api/ai/transcribe
 *
 * Speech-to-text (Phase 5). Given an audio FilePayload ContentNode id, download
 * the bytes, transcribe via the resolved speech-to-text provider, and (by
 * default) create a sibling note holding the transcript. Returns the text.
 *
 * Body: { contentId: string, createNote?: boolean }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { prisma } from "@/lib/database/client";
import type { Prisma } from "@/lib/database/generated/prisma";
import { transcribeAudio } from "@/lib/domain/ai/transcribe/transcribe";
import { describeTranscribeError } from "@/lib/domain/ai/transcribe";
import {
  generateUniqueSlug,
  extractSearchTextFromTipTap,
} from "@/lib/domain/content";
import type { JSONContent } from "@tiptap/core";

/** Build a TipTap doc from transcript text — one paragraph per non-empty line. */
function transcriptToDoc(text: string): JSONContent {
  const paragraphs = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    type: "doc",
    content:
      paragraphs.length > 0
        ? paragraphs.map((line) => ({
            type: "paragraph",
            content: [{ type: "text", text: line }],
          }))
        : [{ type: "paragraph" }],
  };
}

export async function POST(request: NextRequest) {
  let userId: string;
  try {
    const session = await requireAuth();
    userId = session.user.id;
  } catch {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    contentId?: string;
    createNote?: boolean;
  } | null;
  const contentId = typeof body?.contentId === "string" ? body.contentId : "";
  const createNote = body?.createNote !== false; // default true
  if (!contentId) {
    return NextResponse.json(
      { success: false, error: "Missing contentId" },
      { status: 400 },
    );
  }

  // Resolve the audio file node (ownership-scoped) + its storage key.
  const node = await prisma.contentNode.findFirst({
    where: { id: contentId, ownerId: userId, deletedAt: null },
    include: { filePayload: true },
  });
  if (!node?.filePayload?.storageKey) {
    return NextResponse.json(
      { success: false, error: "Audio file not found" },
      { status: 404 },
    );
  }
  const { storageKey, mimeType } = node.filePayload;
  if (mimeType && !mimeType.startsWith("audio/")) {
    return NextResponse.json(
      { success: false, error: "Not an audio file" },
      { status: 400 },
    );
  }

  // Download the bytes via the user's storage provider.
  let audio: Uint8Array;
  try {
    const { getUserStorageProvider } = await import(
      "@/lib/infrastructure/storage"
    );
    const storageProvider = await getUserStorageProvider(userId);
    const url = await storageProvider.generateDownloadUrl(storageKey);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download failed: ${res.statusText}`);
    audio = new Uint8Array(await res.arrayBuffer());
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to read audio file",
      },
      { status: 502 },
    );
  }

  // Transcribe.
  let transcript: Awaited<ReturnType<typeof transcribeAudio>>;
  try {
    transcript = await transcribeAudio(
      { audio, mimeType: mimeType ?? undefined },
      userId,
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: describeTranscribeError(error) },
      { status: 422 },
    );
  }

  // Optionally persist a sibling note with the transcript.
  let noteId: string | null = null;
  if (createNote && transcript.text.trim()) {
    try {
      const title = `Transcript — ${node.title}`.slice(0, 200);
      const slug = await generateUniqueSlug(title, userId);
      const tiptapJson = transcriptToDoc(transcript.text);
      const searchText = extractSearchTextFromTipTap(tiptapJson);
      const wordCount = searchText.split(/\s+/).filter(Boolean).length;
      const created = await prisma.contentNode.create({
        data: {
          ownerId: userId,
          title,
          slug,
          contentType: "note",
          parentId: node.parentId,
          notePayload: {
            create: {
              tiptapJson: tiptapJson as unknown as Prisma.InputJsonValue,
              searchText,
              metadata: {
                wordCount,
                characterCount: searchText.length,
                readingTime: Math.ceil(wordCount / 200),
              },
            },
          },
        },
      });
      noteId = created.id;
    } catch {
      // Note creation is best-effort — still return the transcript text.
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      text: transcript.text,
      language: transcript.language,
      durationSeconds: transcript.durationSeconds,
      noteId,
    },
  });
}
