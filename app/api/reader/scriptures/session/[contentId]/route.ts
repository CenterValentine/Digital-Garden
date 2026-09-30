/** GET /api/reader/scriptures/session/[contentId] → which collection a session opens. */

import { readerRouteWithParams } from "@/lib/domain/reader/server/route";
import { getScriptureSession } from "@/lib/domain/scripture/server/sessions";

export const GET = readerRouteWithParams<{ contentId: string }, unknown>(
  "/api/reader/scriptures/session/[contentId]",
  async ({ ownerId, params }) => getScriptureSession(ownerId, params.contentId)
);
