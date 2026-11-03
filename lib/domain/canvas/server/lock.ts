/**
 * Canvas archive — what an imported node may not do (server-only, §7).
 *
 * ONE module answers, and every seam that can rename, move or publish a node
 * asks it explicitly (`pnpm canvas:check` pins the seams, so a new rename path
 * that skips the lock fails the build). The UI only reflects these answers.
 *
 *   - Titles of imported items stay as Canvas has them. The import report is
 *     the importer's own note and isn't locked; an item Canvas removed is no
 *     longer Canvas's, so its title unlocks.
 *   - Imported items move freely inside their course folder, never out of it:
 *     an item living elsewhere would make module-scoped re-import ambiguous.
 *     The course folder itself goes wherever the user likes.
 *   - Imported course material is the instructor's work, so it can't be
 *     published. The user's own notes beside it can.
 *
 * Each function returns a user-facing refusal, or null when the action is fine.
 */

import "server-only";
import { prisma } from "@/lib/database/client";
import { COURSE_LINK_KEY } from "../plan";
import { isTitleLockedType } from "../types";

async function linkOf(contentId: string) {
  return prisma.canvasSyncLink.findUnique({
    where: { contentId },
    select: { canvasType: true, status: true, connectionId: true, courseId: true },
  });
}

export async function canvasTitleLockRefusal(contentId: string): Promise<string | null> {
  const link = await linkOf(contentId);
  if (!link || link.status !== "linked" || !isTitleLockedType(link.canvasType)) return null;
  return "This title comes from Canvas and stays as Canvas has it. Add your own note beside it instead.";
}

async function isWithin(nodeId: string | null, ancestorId: string): Promise<boolean> {
  let current = nodeId;
  for (let hop = 0; current && hop < 64; hop++) {
    if (current === ancestorId) return true;
    const node: { parentId: string | null } | null = await prisma.contentNode.findUnique({
      where: { id: current },
      select: { parentId: true },
    });
    current = node?.parentId ?? null;
  }
  return false;
}

export async function canvasMoveRefusal(contentId: string, targetParentId: string | null): Promise<string | null> {
  const link = await linkOf(contentId);
  if (!link || link.status !== "linked" || link.canvasType === "course") return null;
  const root = await prisma.canvasSyncLink.findUnique({
    where: {
      connectionId_courseId_canvasKey: {
        connectionId: link.connectionId,
        courseId: link.courseId,
        canvasKey: COURSE_LINK_KEY,
      },
    },
    select: { contentId: true },
  });
  if (!root?.contentId) return null;
  if (await isWithin(targetParentId, root.contentId)) return null;
  return "Items imported from Canvas stay inside their course folder. Move the whole course folder, or add a shortcut where you want it.";
}

export async function canvasPublishRefusal(contentId: string): Promise<string | null> {
  const link = await linkOf(contentId);
  if (!link || link.canvasType === "report") return null;
  return "This came from a Canvas course. Course materials are the instructor's work and stay private. To publish your own writing, copy it into a new note.";
}

/** Ids of every node with a live Canvas title lock, for the tree (one query). */
export async function lockedContentIds(ownerId: string): Promise<Set<string>> {
  const rows = await prisma.canvasSyncLink.findMany({
    where: { status: "linked", contentId: { not: null }, connection: { ownerId }, canvasType: { not: "report" } },
    select: { contentId: true },
  });
  return new Set(rows.map((row) => row.contentId as string));
}
