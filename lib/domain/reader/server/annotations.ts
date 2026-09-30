/**
 * Reading progress + annotations (server-only).
 *
 * Annotations sit beside the text they mark (the text is a book file or a
 * corpus the user does not edit). "Send to note" is the Principle-2 bridge:
 * it copies the passage into an ordinary note next to the book, with a link
 * back to the exact spot.
 */

import "server-only";
import type { JSONContent } from "@tiptap/core";
import { z } from "zod";
import { prisma } from "@/lib/database/client";
import type { Prisma } from "@/lib/database/generated/prisma";
import { generateUniqueSlug } from "@/lib/domain/content";
import { extractSearchTextFromTipTap } from "@/lib/domain/content/search-text";
import { writeNoteContent } from "@/lib/domain/content/write-note-content";
import { readerDb, type ReaderAnnotationRow, type ReadingProgressRow } from "../db";
import {
  parseContentTargetKey,
  type ReaderAnnotationDto,
  type ReaderAnnotationKind,
  type ReaderAnnotationSource,
  type ReaderLocator,
  type ReadingProgressDto,
} from "../types";
import { ReaderFetchError } from "./http";
import { parseScriptureTargetKey } from "@/lib/domain/scripture/types";
import { sendScriptureAnnotationToNote } from "@/lib/domain/scripture/server/notes";

export const locatorSchema = z.object({
  href: z.string().max(2000).optional(),
  locations: z.object({
    cfi: z.string().max(4000).optional(),
    progression: z.number().min(0).max(1).optional(),
    totalProgression: z.number().min(0).max(1).optional(),
    position: z.number().int().min(0).optional(),
    start: z.number().int().min(0).optional(),
    end: z.number().int().min(0).optional(),
  }),
  text: z
    .object({
      before: z.string().max(2000).optional(),
      highlight: z.string().max(20000).optional(),
      after: z.string().max(2000).optional(),
    })
    .optional(),
  label: z.string().max(500).optional(),
});

export const targetKeySchema = z
  .string()
  .min(3)
  .max(255)
  .regex(/^(content:[0-9a-f-]{36}|[a-z][a-z0-9-]*:[\w:.-]+)$/i);

export const createAnnotationSchema = z.object({
  targetKey: targetKeySchema,
  kind: z.enum(["highlight", "note", "bookmark"]),
  locator: locatorSchema,
  color: z.string().max(20).nullish(),
  body: z.string().max(20000).nullish(),
});

export const updateAnnotationSchema = z.object({
  color: z.string().max(20).nullish(),
  body: z.string().max(20000).nullish(),
});

/** A `content:<id>` target must be the caller's own node. */
export async function assertTargetOwned(ownerId: string, targetKey: string): Promise<void> {
  const contentId = parseContentTargetKey(targetKey);
  if (!contentId) return; // corpus targets (e.g. scripture:) are shared text
  const node = await prisma.contentNode.findFirst({
    where: { id: contentId, ownerId, deletedAt: null },
    select: { id: true },
  });
  if (!node) throw new ReaderFetchError("Book not found", 404);
}

export function toAnnotationDto(row: ReaderAnnotationRow): ReaderAnnotationDto {
  return {
    id: row.id,
    targetKey: row.targetKey,
    kind: row.kind as ReaderAnnotationKind,
    locator: row.locator as ReaderLocator,
    color: row.color,
    body: row.body,
    noteContentId: row.noteContentId,
    source: row.source as ReaderAnnotationSource,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toProgressDto(row: ReadingProgressRow): ReadingProgressDto {
  return {
    targetKey: row.targetKey,
    locator: row.locator as ReaderLocator,
    percent: row.percent,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listAnnotations(
  ownerId: string,
  targetKey: string
): Promise<ReaderAnnotationDto[]> {
  const rows = await readerDb.readerAnnotation.findMany({
    where: { ownerId, targetKey },
    orderBy: { createdAt: "asc" },
    take: 5000,
  });
  return rows.map(toAnnotationDto);
}

export async function createAnnotation(
  ownerId: string,
  input: z.infer<typeof createAnnotationSchema>
): Promise<ReaderAnnotationDto> {
  await assertTargetOwned(ownerId, input.targetKey);
  const row = await readerDb.readerAnnotation.create({
    data: {
      ownerId,
      targetKey: input.targetKey,
      kind: input.kind,
      locator: input.locator,
      color: input.color ?? null,
      body: input.body ?? null,
      source: "reader",
    },
  });
  return toAnnotationDto(row);
}

async function ownedAnnotation(ownerId: string, id: string): Promise<ReaderAnnotationRow> {
  const row = await readerDb.readerAnnotation.findFirst({ where: { id, ownerId } });
  if (!row) throw new ReaderFetchError("Annotation not found", 404);
  return row;
}

export async function updateAnnotation(
  ownerId: string,
  id: string,
  input: z.infer<typeof updateAnnotationSchema>
): Promise<ReaderAnnotationDto> {
  await ownedAnnotation(ownerId, id);
  const row = await readerDb.readerAnnotation.update({
    where: { id },
    data: {
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.body !== undefined ? { body: input.body } : {}),
    },
  });
  return toAnnotationDto(row);
}

export async function deleteAnnotation(ownerId: string, id: string): Promise<void> {
  await ownedAnnotation(ownerId, id);
  await readerDb.readerAnnotation.delete({ where: { id } });
}

export async function getProgress(
  ownerId: string,
  targetKey: string
): Promise<ReadingProgressDto | null> {
  const row = await readerDb.readingProgress.findUnique({
    where: { ownerId_targetKey: { ownerId, targetKey } },
  });
  return row ? toProgressDto(row) : null;
}

export async function saveProgress(
  ownerId: string,
  targetKey: string,
  locator: ReaderLocator,
  percent: number
): Promise<ReadingProgressDto> {
  await assertTargetOwned(ownerId, targetKey);
  const clamped = Math.max(0, Math.min(1, percent));
  const row = await readerDb.readingProgress.upsert({
    where: { ownerId_targetKey: { ownerId, targetKey } },
    create: { ownerId, targetKey, locator, percent: clamped },
    update: { locator, percent: clamped },
  });
  return toProgressDto(row);
}

// ── Send to note ───────────────────────────────────────────────────────────

/** In-app link that opens the book at the annotation's spot. */
export function readerDeepLink(contentId: string, locator: ReaderLocator): string {
  const params = new URLSearchParams({ content: contentId });
  if (locator.locations.cfi) params.set("readerLoc", locator.locations.cfi);
  return `/content?${params.toString()}`;
}

function quoteBlocks(
  annotation: ReaderAnnotationRow,
  contentId: string
): JSONContent[] {
  const locator = annotation.locator as ReaderLocator;
  const passage = locator.text?.highlight?.trim();
  const blocks: JSONContent[] = [];
  if (passage) {
    blocks.push({
      type: "blockquote",
      content: [{ type: "paragraph", content: [{ type: "text", text: passage }] }],
    });
  }
  blocks.push({
    type: "paragraph",
    content: [
      {
        type: "text",
        text: locator.label ? `↩ ${locator.label}` : "↩ Open in reader",
        marks: [{ type: "link", attrs: { href: readerDeepLink(contentId, locator) } }],
      },
    ],
  });
  if (annotation.body?.trim()) {
    blocks.push({
      type: "paragraph",
      content: [{ type: "text", text: annotation.body.trim() }],
    });
  }
  return blocks;
}

/**
 * Find or create "<Book> — Notes" beside the book (same folder), then append
 * the passage. Uses writeNoteContent so an open editor sees the append.
 */
export async function sendAnnotationToNote(
  ownerId: string,
  annotationId: string
): Promise<{ noteContentId: string; created: boolean }> {
  const annotation = await ownedAnnotation(ownerId, annotationId);
  // Scripture highlights: "<Book> — Notes" at the top of the tree.
  const corpusId = parseScriptureTargetKey(annotation.targetKey);
  if (corpusId) {
    const result = await sendScriptureAnnotationToNote({
      ownerId,
      corpusId,
      locator: annotation.locator as ReaderLocator,
      body: annotation.body,
      existingNoteId: annotation.noteContentId,
    });
    await readerDb.readerAnnotation.update({
      where: { id: annotation.id },
      data: { noteContentId: result.noteContentId },
    });
    return result;
  }
  const bookId = parseContentTargetKey(annotation.targetKey);
  if (!bookId) throw new ReaderFetchError("Only book and scripture annotations can be sent to a note", 400);
  const book = await prisma.contentNode.findFirst({
    where: { id: bookId, ownerId, deletedAt: null },
    select: { title: true, parentId: true },
  });
  if (!book) throw new ReaderFetchError("Book not found", 404);

  let bookTitle = book.title.replace(/\.[a-z0-9]+$/i, "");
  try {
    const meta = await readerDb.bookMeta.findUnique({ where: { contentId: bookId } });
    if (meta?.title) bookTitle = meta.title;
  } catch {
    // metadata is optional here
  }
  const noteTitle = `${bookTitle} — Notes`.slice(0, 255);
  const blocks = quoteBlocks(annotation, bookId);

  const existingNoteId =
    annotation.noteContentId ??
    (
      await prisma.contentNode.findFirst({
        where: {
          ownerId,
          parentId: book.parentId,
          title: noteTitle,
          contentType: "note",
          deletedAt: null,
        },
        select: { id: true },
      })
    )?.id ??
    null;

  let noteContentId: string;
  let created = false;
  if (existingNoteId) {
    await writeNoteContent({
      contentId: existingNoteId,
      ownerId,
      mode: "append",
      content: { type: "doc", content: blocks },
    });
    noteContentId = existingNoteId;
  } else {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Notes on " },
            {
              type: "text",
              text: bookTitle,
              marks: [{ type: "link", attrs: { href: `/content?content=${bookId}` } }],
            },
          ],
        },
        ...blocks,
      ],
    };
    const searchText = extractSearchTextFromTipTap(doc);
    const note = await prisma.contentNode.create({
      data: {
        ownerId,
        title: noteTitle,
        slug: await generateUniqueSlug(noteTitle, ownerId),
        contentType: "note",
        parentId: book.parentId,
        displayOrder: 0,
        notePayload: {
          create: {
            tiptapJson: doc as unknown as Prisma.InputJsonValue,
            searchText,
            metadata: { readerBookId: bookId },
          },
        },
      },
      select: { id: true },
    });
    noteContentId = note.id;
    created = true;
  }

  await readerDb.readerAnnotation.update({
    where: { id: annotation.id },
    data: { noteContentId },
  });
  return { noteContentId, created };
}
