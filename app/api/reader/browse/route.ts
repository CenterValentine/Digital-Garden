/**
 * GET /api/reader/browse?source=opds:…&href=<feed url>
 * Browse an OPDS catalog's navigation tree (root when href is omitted).
 */

import { readerRoute } from "@/lib/domain/reader/server/route";
import { browseSource } from "@/lib/domain/reader/server/sources";

export const GET = readerRoute("/api/reader/browse", async ({ ownerId, request }) => {
  const params = new URL(request.url).searchParams;
  return browseSource(
    params.get("source") ?? "",
    ownerId,
    params.get("href") ?? undefined
  );
});
