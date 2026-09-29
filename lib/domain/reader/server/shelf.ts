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

export interface PlaceBookResult {
  /** Folder the shortcut landed in; null when the book was only opened. */
  folderId: string | null;
  shortcutId: string | null;
  /** "created" | "exists" (a shortcut already there) | "home" (the book lives there) | "opened" (no folder target). */
  outcome: "created" | "exists" | "home" | "opened";
}

/**
 * Resolve the folder a "+" action targets: an explicit folder, else the
 * tree selection (a folder itself, or the selected item's parent) — the same
 * rule the tree's own create path uses (LeftSidebarContent.handleCreate).
 */
async function resolveTargetFolder(
  ownerId: string,
  parentId: string | null,
  selectedId: string | null
): Promise<string | null> {
  const candidateId = parentId ?? selectedId;
  if (!candidateId) return null;
  const node = await prisma.contentNode.findFirst({
    where: { id: candidateId, ownerId, deletedAt: null },
    select: { id: true, contentType: true, parentId: true },
  });
  if (!node) return null;
  if (node.contentType === "folder") return node.id;
  if (parentId) throw new ReaderFetchError("Books can only be placed in a folder", 400);
  if (!node.parentId) return null;
  const parent = await prisma.contentNode.findFirst({
    where: { id: node.parentId, ownerId, deletedAt: null, contentType: "folder" },
    select: { id: true },
  });
  return parent?.id ?? null;
}

export async function placeBookShortcut(
  ownerId: string,
  input: { contentId: string; parentId: string | null; selectedId: string | null }
): Promise<PlaceBookResult> {
  const book = await prisma.contentNode.findFirst({
    where: { id: input.contentId, ownerId, deletedAt: null, contentType: "file" },
    select: { id: true, title: true, parentId: true },
  });
  if (!book) throw new ReaderFetchError("Book not found", 404);

  const folderId = await resolveTargetFolder(ownerId, input.parentId, input.selectedId);
  if (!folderId) return { folderId: null, shortcutId: null, outcome: "opened" };
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
