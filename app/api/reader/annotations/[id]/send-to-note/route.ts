/**
 * POST /api/reader/annotations/[id]/send-to-note
 * Appends the passage to "<Book> — Notes" beside the book (created on first
 * use) with a link back to the exact spot.
 */

import { sendAnnotationToNote } from "@/lib/domain/reader/server/annotations";
import { readerRouteWithParams } from "@/lib/domain/reader/server/route";

export const POST = readerRouteWithParams<{ id: string }, unknown>(
  "/api/reader/annotations/[id]/send-to-note",
  async ({ ownerId, params }) => sendAnnotationToNote(ownerId, params.id)
);
