/**
 * POST /api/reader/import/kindle (multipart: file = "My Clippings.txt")
 */

import { ReaderFetchError } from "@/lib/domain/reader/server/http";
import { importKindleClippings } from "@/lib/domain/reader/server/integrations";
import { readerRoute } from "@/lib/domain/reader/server/route";

const MAX_BYTES = 20 * 1024 * 1024;

export const POST = readerRoute("/api/reader/import/kindle", async ({ ownerId, request }) => {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new ReaderFetchError("Attach your My Clippings.txt file", 400);
  if (file.size > MAX_BYTES) throw new ReaderFetchError("File too large (20 MB max)", 413);
  return importKindleClippings(ownerId, await file.text());
});
