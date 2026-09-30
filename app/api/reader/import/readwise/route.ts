/**
 * POST /api/reader/import/readwise → pull highlights via the Readwise export
 * API (incremental after the first sync).
 */

import { importReadwise } from "@/lib/domain/reader/server/integrations";
import { readerRoute } from "@/lib/domain/reader/server/route";

export const POST = readerRoute("/api/reader/import/readwise", async ({ ownerId }) =>
  importReadwise(ownerId)
);
