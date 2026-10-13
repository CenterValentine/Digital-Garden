/**
 * When an item's CONTENT last changed.
 *
 * `ContentNode.updatedAt` moves on metadata edits (title, move, icon) and on
 * some payload routes, but NOT on a collaborative save: the Hocuspocus store
 * hook mirrors the live document into `NotePayload` and stamps that row only.
 * Found 2026-10-13 when an MCP replace went through the live document and the
 * node row still read a date nine days old — so a compare-and-set keyed on
 * the node row would have passed for a second writer. Any "did it change
 * since I read it" check must use this, never the node row alone.
 *
 * The latest of the node row and every payload row present. Max, not a
 * switch on content type: a database's notes panel is a NotePayload beside
 * its DataPayload, and either may be the one that moved.
 */

interface Stamped {
  updatedAt: Date;
}

export interface ContentWithPayloadStamps {
  updatedAt: Date;
  notePayload?: Stamped | null;
  codePayload?: Stamped | null;
  filePayload?: Stamped | null;
  dataPayload?: Stamped | null;
  htmlPayload?: Stamped | null;
  externalPayload?: Stamped | null;
}

export function contentUpdatedAt(node: ContentWithPayloadStamps): Date {
  let latest = node.updatedAt;
  for (const payload of [node.notePayload, node.codePayload, node.filePayload, node.dataPayload, node.htmlPayload, node.externalPayload]) {
    if (payload?.updatedAt && payload.updatedAt.getTime() > latest.getTime()) latest = payload.updatedAt;
  }
  return latest;
}

/** Prisma `select` fragment that fetches every stamp `contentUpdatedAt` reads. */
export const PAYLOAD_STAMP_SELECT = {
  notePayload: { select: { updatedAt: true } },
  codePayload: { select: { updatedAt: true } },
  filePayload: { select: { updatedAt: true } },
  dataPayload: { select: { updatedAt: true } },
  htmlPayload: { select: { updatedAt: true } },
  externalPayload: { select: { updatedAt: true } },
} as const;
