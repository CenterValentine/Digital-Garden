/**
 * POST /api/reader/scriptures/install { corpusId } — load a collection into
 * the shared tables (owner or admin; idempotent), then enable it for the caller.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/infrastructure/auth/middleware";
import { readerRoute } from "@/lib/domain/reader/server/route";
import { installCorpus, setCorpusEnabled } from "@/lib/domain/scripture/server/corpus";

// Fetches five volumes and writes ~42k verse rows on first install.
export const maxDuration = 300;

const bodySchema = z.object({ corpusId: z.string().min(1).max(80) });

export const POST = readerRoute("/api/reader/scriptures/install", async ({ ownerId, request }) => {
  try {
    // Shared, public-domain text for the whole garden: an owner/admin action.
    await requireRole("admin");
  } catch {
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: "Only an owner or admin can install a scripture collection." } },
      { status: 403 }
    );
  }
  const { corpusId } = bodySchema.parse(await request.json());
  const result = await installCorpus(corpusId);
  await setCorpusEnabled(ownerId, corpusId, true);
  return result;
});
