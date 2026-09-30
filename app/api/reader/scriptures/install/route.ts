/**
 * POST /api/reader/scriptures/install { corpusId } — "Add" in the catalog:
 * load the collection into the shared tables if nobody has yet (any signed-in
 * user; idempotent and locked — see installCorpus), then enable it for the
 * caller.
 */

import { z } from "zod";
import { readerRoute } from "@/lib/domain/reader/server/route";
import { installCorpus, setCorpusEnabled } from "@/lib/domain/scripture/server/corpus";

// Fetches five volumes and writes ~42k verse rows on first install.
export const maxDuration = 300;

const bodySchema = z.object({ corpusId: z.string().min(1).max(80) });

export const POST = readerRoute("/api/reader/scriptures/install", async ({ ownerId, request }) => {
  const { corpusId } = bodySchema.parse(await request.json());
  const result = await installCorpus(corpusId);
  await setCorpusEnabled(ownerId, corpusId, true);
  return result;
});
