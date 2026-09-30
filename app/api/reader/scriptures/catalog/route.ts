/**
 * GET /api/reader/scriptures/catalog → every catalogued collection across
 * traditions, with shared installed state and the caller's enabled state.
 */

import { readerRoute } from "@/lib/domain/reader/server/route";
import { listCatalog } from "@/lib/domain/scripture/server/corpus";

export const GET = readerRoute("/api/reader/scriptures/catalog", async ({ ownerId }) => ({
  items: await listCatalog(ownerId),
}));
