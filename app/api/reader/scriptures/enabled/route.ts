/**
 * GET /api/reader/scriptures/enabled → the collections in the caller's
 * Reader → Scriptures menu. Answers an empty list (not 503) before the
 * scripture migration, so the "+" menu never errors.
 */

import { readerRoute } from "@/lib/domain/reader/server/route";
import { listEnabledCorpora } from "@/lib/domain/scripture/server/corpus";
import { scriptureTablesAvailable } from "@/lib/domain/scripture/server/db";

export const GET = readerRoute("/api/reader/scriptures/enabled", async ({ ownerId }) => ({
  corpora: scriptureTablesAvailable() ? await listEnabledCorpora(ownerId) : [],
  migrated: scriptureTablesAvailable(),
}));
