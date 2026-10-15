/**
 * GET /api/reader/books → the user's library (file nodes with BookMeta).
 */

import { listLibraryBooks } from "@/lib/domain/reader/server/library";
import { readerRoute } from "@/lib/domain/reader/server/route";

export const GET = readerRoute("/api/reader/books", async ({ ownerId }) => ({
  books: await listLibraryBooks(ownerId),
}));
