/**
 * Bookshelf placement (server-only): put a library book into another part of
 * the user's tree as a *shortcut* — the book file stays where it lives (one
 * copy, one set of highlights), and the folder gains a pointer to it.
 * Principle 1: the user's own folders are where books are used.
 */

import "server-only";
import crypto from "crypto";
import { prisma } from "@/lib/database/client";
import { generateUniqueSlug } from "@/lib/domain/content";
import { readerDb } from "../db";
import { ReaderFetchError } from "./http";
import { resolveFolderTarget } from "./library";

export interface PlaceBookResult {
  /** Folder the shortcut landed in (null = top of the tree). */
  folderId: string | null;
  shortcutId: string | null;
  /** "created" | "exists" (a shortcut already there) | "home" (the book lives there). */
  outcome: "created" | "exists" | "home";
}

export async function placeBookShortcut(
  ownerId: string,
  input: { contentId: string; parentId: string | null }
): Promise<PlaceBookResult> {
  const book = await prisma.contentNode.findFirst({
    where: { id: input.contentId, ownerId, deletedAt: null, contentType: "file" },
    select: { id: true, title: true, parentId: true },
  });
  if (!book) throw new ReaderFetchError("Book not found", 404);

  // The "+" target, resolved client-side with the tree's rule; a non-folder
  // makes the shortcut its sibling, nothing means the top of the tree.
  const folderId = await resolveFolderTarget(ownerId, input.parentId);
  if (folderId === book.parentId) return { folderId, shortcutId: null, outcome: "home" };

  const existing = await prisma.contentNode.findFirst({
    where: {
      ownerId,
      parentId: folderId,
      deletedAt: null,
      contentType: "shortcut",
      shortcutPayload: { targetContentId: book.id },
    },
    select: { id: true },
  });
  if (existing) return { folderId, shortcutId: existing.id, outcome: "exists" };

  let title = book.title.replace(/\.(epub|pdf|mobi|azw3|fb2|cbz)$/i, "");
  try {
    const meta = await readerDb.bookMeta.findUnique({ where: { contentId: book.id } });
    if (meta?.title) title = meta.title;
  } catch {
    // BookMeta is optional
  }
  title = title.slice(0, 255);

  let slug = await generateUniqueSlug(title, ownerId);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const shortcut = await prisma.contentNode.create({
        data: {
          ownerId,
          title,
          slug,
          contentType: "shortcut",
          parentId: folderId,
          displayOrder: 0,
          shortcutPayload: { create: { target: { connect: { id: book.id } } } },
        },
        select: { id: true },
      });
      return { folderId, shortcutId: shortcut.id, outcome: "created" };
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== "P2002" || attempt === 2) throw error;
      slug = `${await generateUniqueSlug(title, ownerId)}-${crypto.randomBytes(3).toString("hex")}`;
    }
  }
  throw new ReaderFetchError("Could not create the shortcut");
}
