/**
 * POST /api/reader/scriptures/enable { corpusId, enabled } — add or remove an
 * installed collection from the caller's Reader → Scriptures menu.
 */

import { z } from "zod";
import { readerRoute } from "@/lib/domain/reader/server/route";
import { setCorpusEnabled } from "@/lib/domain/scripture/server/corpus";

const bodySchema = z.object({ corpusId: z.string().min(1).max(80), enabled: z.boolean() });

export const POST = readerRoute("/api/reader/scriptures/enable", async ({ ownerId, request }) => {
  const { corpusId, enabled } = bodySchema.parse(await request.json());
  await setCorpusEnabled(ownerId, corpusId, enabled);
  return { corpusId, enabled };
});
