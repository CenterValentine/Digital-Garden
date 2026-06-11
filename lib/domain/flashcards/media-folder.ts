/**
 * Flashcard media folders.
 *
 * Generated card media (AI images + TTS clips) are `referenced` ContentNodes.
 * Rather than pile them at the content root, we file them into a `referenced`
 * folder tree that MIRRORS the deck/subdeck hierarchy:
 *
 *   Flashcard Media/            (referenced root)
 *     <Deck>/                   (referenced)
 *       <Subdeck>/              (referenced)
 *         <generated image/clip>
 *
 * The folders are `role: "referenced"` — hidden in the tree until the user
 * reveals referenced content, at which point the whole deck-mirrored structure
 * is browsable. Each folder sets `includeReferencedContent` so the media inside
 * is visible once the folder is opened. Lifecycle/ref-counting is unchanged:
 * the media is still tracked by the flashcard JSON scan in
 * countLiveContentReferences().
 */

import type { JSONContent } from "@tiptap/core";
import { prisma } from "@/lib/database/client";
import { generateUniqueSlug } from "@/lib/domain/content";
import {
  extractImageContentIds,
  extractAudioContentIds,
} from "@/lib/domain/content/image-refs";
import { logger } from "@/lib/core/logger";

const REFERENCE_ROOT_TITLE = "Flashcard Media";

/** Find-or-create a `referenced` folder with `title` under `parentId`. */
async function ensureReferencedFolder(
  userId: string,
  parentId: string | null,
  title: string,
): Promise<string> {
  const existing = await prisma.contentNode.findFirst({
    where: {
      ownerId: userId,
      parentId,
      title,
      contentType: "folder",
      role: "referenced",
      deletedAt: null,
    },
    select: { id: true },
  });
  if (existing) return existing.id;

  const slug = await generateUniqueSlug(title, userId);
  const created = await prisma.contentNode.create({
    data: {
      ownerId: userId,
      parentId,
      title,
      slug,
      contentType: "folder",
      role: "referenced",
      displayOrder: 0,
      folderPayload: { create: { includeReferencedContent: true } },
    },
    select: { id: true },
  });
  return created.id;
}

/** Build a deck's ancestry as an ordered (root → leaf) list of names. */
async function deckAncestry(
  userId: string,
  deckId: string,
): Promise<Array<{ id: string; name: string }>> {
  const chain: Array<{ id: string; name: string }> = [];
  const seen = new Set<string>();
  let current: string | null = deckId;
  while (current && !seen.has(current)) {
    seen.add(current);
    const deck: { id: string; name: string; parentDeckId: string | null } | null =
      await prisma.flashcardDeck.findFirst({
        where: { id: current, ownerId: userId },
        select: { id: true, name: true, parentDeckId: true },
      });
    if (!deck) break;
    chain.unshift({ id: deck.id, name: deck.name });
    current = deck.parentDeckId;
  }
  return chain;
}

/**
 * Resolve (find-or-create) the `referenced` folder mirroring a deck's path.
 * Returns the leaf folder's ContentNode id, or null if the deck is unknown.
 */
export async function ensureDeckMirrorFolder(
  userId: string,
  deckId: string,
): Promise<string | null> {
  const ancestry = await deckAncestry(userId, deckId);
  if (ancestry.length === 0) return null;
  let parentId = await ensureReferencedFolder(userId, null, REFERENCE_ROOT_TITLE);
  for (const deck of ancestry) {
    parentId = await ensureReferencedFolder(userId, parentId, deck.name);
  }
  return parentId;
}

/**
 * File a card's embedded media (images + audio) into the deck-mirrored
 * `referenced` folder. Best-effort: re-parents only the user's own referenced,
 * non-deleted media nodes. Never throws — placement is cosmetic, not critical.
 */
export async function fileFlashcardMediaUnderDeck(
  userId: string,
  deckId: string,
  frontContent: JSONContent,
  backContent: JSONContent,
): Promise<void> {
  try {
    const ids = new Set<string>([
      ...extractImageContentIds(frontContent),
      ...extractAudioContentIds(frontContent),
      ...extractImageContentIds(backContent),
      ...extractAudioContentIds(backContent),
    ]);
    if (ids.size === 0) return;

    const folderId = await ensureDeckMirrorFolder(userId, deckId);
    if (!folderId) return;

    await prisma.contentNode.updateMany({
      where: {
        id: { in: [...ids] },
        ownerId: userId,
        role: "referenced",
        deletedAt: null,
      },
      data: { parentId: folderId },
    });
  } catch (error) {
    logger.warn({
      layer: "content",
      event: "flashcard.media_folder.file_failed",
      summary: "failed to file flashcard media under deck folder",
      error,
    });
  }
}
