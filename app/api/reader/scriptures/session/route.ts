/**
 * POST /api/reader/scriptures/session { corpusId, parentId?, title? } — put a
 * collection in the file tree as a session (adds the collection first).
 */

import { z } from "zod";
import { readerRoute } from "@/lib/domain/reader/server/route";
import { createScriptureSession } from "@/lib/domain/scripture/server/sessions";

// The first session of a collection may load its text (~42k verses).
export const maxDuration = 300;

const bodySchema = z.object({
  corpusId: z.string().min(1).max(80),
  parentId: z.string().uuid().nullish(),
  title: z.string().max(255).nullish(),
});

export const POST = readerRoute("/api/reader/scriptures/session", async ({ ownerId, request }) => {
  const body = bodySchema.parse(await request.json());
  return createScriptureSession({ ownerId, ...body });
});
