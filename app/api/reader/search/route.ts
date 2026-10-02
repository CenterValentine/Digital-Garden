/**
 * GET /api/reader/search?source=<sourceId>&q=<query>&page=<cursor>
 */

import { readerRoute } from "@/lib/domain/reader/server/route";
import { ReaderFetchError } from "@/lib/domain/reader/server/http";
import { searchSource } from "@/lib/domain/reader/server/sources";

export const GET = readerRoute("/api/reader/search", async ({ ownerId, request }) => {
  const params = new URL(request.url).searchParams;
  const source = params.get("source") ?? "";
  const query = (params.get("q") ?? "").trim();
  const page = params.get("page") ?? undefined;
  if (!source) throw new ReaderFetchError("source is required", 400);
  if (!query && !page) throw new ReaderFetchError("Type something to search for", 400);
  return searchSource(source, query.slice(0, 300), ownerId, page);
});
