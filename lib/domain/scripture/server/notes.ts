/**
 * "Send to note" for scripture highlights (server-only).
 *
 * The book-file flow puts "<Book> — Notes" beside the book file; scripture has
 * no file in the tree, so the note is "<Scripture book> — Notes" (e.g.
 * "Alma — Notes") at the top of the tree, created on first use. The passage
 * arrives as a quote plus an anchored wiki-link back to the verses
 * (lib/domain/content/link-anchor.ts, kind `verse`), so the link resolves
 * through the same path as every other wiki-link.
 */

import "server-only";
import type { JSONContent } from "@tiptap/core";
import { prisma } from "@/lib/database/client";
import type { Prisma } from "@/lib/database/generated/prisma";
import { generateUniqueSlug } from "@/lib/domain/content/slug";
import { extractSearchTextFromTipTap } from "@/lib/domain/content/search-text";
import { writeNoteContent } from "@/lib/domain/content/write-note-content";
import type { ReaderLocator } from "@/lib/domain/reader/types";
import { parseVerseHref, scriptureTabId, VERSE_ANCHOR_KIND } from "../types";
import { scriptureDb } from "./db";

function verseLink(corpusId: string, href: string, label: string, corpusTitle: string): JSONContent {
  return {
    type: "wikiLink",
    attrs: {
      targetId: scriptureTabId(corpusId),
      targetTitle: corpusTitle,
      anchor: `${VERSE_ANCHOR_KIND}:${href}`,
      anchorLabel: label,
      displayText: label,
    },
  };
}

export async function sendScriptureAnnotationToNote(input: {
  ownerId: string;
  corpusId: string;
  locator: ReaderLocator;
  body: string | null;
  existingNoteId: string | null;
}): Promise<{ noteContentId: string; created: boolean }> {
  const { ownerId, corpusId, locator, body } = input;
  const ref = locator.href ? parseVerseHref(locator.href) : null;
  const [corpus, book] = await Promise.all([
    scriptureDb.corpus.findUnique({ where: { id: corpusId } }),
    ref ? scriptureDb.book.findFirst({ where: { corpusId, slug: ref.bookSlug } }) : Promise.resolve(null),
  ]);
  const corpusTitle = corpus?.title ?? "Scripture";
  const noteTitle = `${book?.name ?? corpusTitle} — Notes`.slice(0, 255);
  const label = locator.label ?? locator.href ?? corpusTitle;

  const blocks: JSONContent[] = [];
  const passage = locator.text?.highlight?.trim();
  if (passage) {
    blocks.push({ type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: passage }] }] });
  }
  blocks.push({
    type: "paragraph",
    content: locator.href
      ? [{ type: "text", text: "— " }, verseLink(corpusId, locator.href, label, corpusTitle)]
      : [{ type: "text", text: `— ${label}` }],
  });
  if (body?.trim()) blocks.push({ type: "paragraph", content: [{ type: "text", text: body.trim() }] });

  const existingNoteId =
    input.existingNoteId ??
    (
      await prisma.contentNode.findFirst({
        where: { ownerId, parentId: null, title: noteTitle, contentType: "note", deletedAt: null },
        select: { id: true },
      })
    )?.id ??
    null;

  if (existingNoteId) {
    await writeNoteContent({
      contentId: existingNoteId,
      ownerId,
      mode: "append",
      content: { type: "doc", content: blocks },
    });
    return { noteContentId: existingNoteId, created: false };
  }

  const doc: JSONContent = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: `Study notes on ${book?.name ?? corpusTitle} (${corpusTitle}).` }] },
      ...blocks,
    ],
  };
  const note = await prisma.contentNode.create({
    data: {
      ownerId,
      title: noteTitle,
      slug: await generateUniqueSlug(noteTitle, ownerId),
      contentType: "note",
      parentId: null,
      displayOrder: 0,
      notePayload: {
        create: {
          tiptapJson: doc as unknown as Prisma.InputJsonValue,
          searchText: extractSearchTextFromTipTap(doc),
          metadata: { scriptureCorpusId: corpusId, scriptureBook: book?.slug ?? null },
        },
      },
    },
    select: { id: true },
  });
  return { noteContentId: note.id, created: true };
}
