/**
 * Backfill a note's media links — the ContentLink "image-ref" / "audio-ref"
 * edges that say an image or audio clip is IN a note's text.
 *
 * Why: until 2026-10-06 those edges were refreshed only on REST saves. Live
 * collaborative saves — how notes are normally edited — refreshed window
 * links but not media links, so for most notes they are stale: an image
 * removed from the text still counts as embedded, one pasted during live
 * editing doesn't. The tree's "In this note's text" badge and the move rules
 * that keep such items with their note read these edges. Collaborative saves
 * now keep them current (lib/domain/collaboration/documents.ts), but only as
 * each note is next saved; this brings every note up to date at once.
 *
 * LINKS ONLY. It never trashes media — the same `trashOrphans: false` the
 * collaborative save uses — so an image whose last link disappears stays
 * where it is.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/backfill-media-links.ts          # report only
 *   npx tsx --env-file=.env.local scripts/backfill-media-links.ts --apply  # write the links
 *
 * Idempotent: a second --apply finds nothing to change.
 */
import type { JSONContent } from "@tiptap/core";
import { prisma } from "@/lib/database/client";
import {
  extractAudioContentIds,
  extractImageContentIds,
  syncImageReferences,
} from "@/lib/domain/content/image-refs";

const APPLY = process.argv.includes("--apply");
const BATCH = 200;

async function main() {
  let cursor: string | undefined;
  let notes = 0;
  let notesToChange = 0;
  let linksToAdd = 0;
  let linksToRemove = 0;

  for (;;) {
    const batch = await prisma.contentNode.findMany({
      where: { contentType: "note", deletedAt: null, notePayload: { isNot: null } },
      select: { id: true, ownerId: true, notePayload: { select: { tiptapJson: true } } },
      orderBy: { id: "asc" },
      take: BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;

    for (const note of batch) {
      notes += 1;
      const json = note.notePayload?.tiptapJson as JSONContent | null | undefined;
      if (!json || typeof json !== "object") continue;
      const wanted = {
        "image-ref": new Set(extractImageContentIds(json)),
        "audio-ref": new Set(extractAudioContentIds(json)),
      } as const;
      const existing = await prisma.contentLink.findMany({
        where: { sourceId: note.id, linkType: { in: ["image-ref", "audio-ref"] } },
        select: { targetId: true, linkType: true },
      });
      let add = 0;
      let remove = 0;
      for (const linkType of ["image-ref", "audio-ref"] as const) {
        const have = new Set(existing.filter((l) => l.linkType === linkType).map((l) => l.targetId));
        for (const id of wanted[linkType]) if (!have.has(id)) add += 1;
        for (const id of have) if (!wanted[linkType].has(id)) remove += 1;
      }
      if (add === 0 && remove === 0) continue;
      notesToChange += 1;
      linksToAdd += add;
      linksToRemove += remove;
      if (APPLY) {
        await syncImageReferences(note.id, json, note.ownerId, { trashOrphans: false });
      }
    }
  }

  console.log(
    `${APPLY ? "Applied" : "Would apply (dry run — pass --apply to write)"}: ` +
      `${notesToChange} of ${notes} notes, +${linksToAdd} media links, -${linksToRemove} stale links. ` +
      `No media was trashed.`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
