/**
 * GET /api/canvas/linked → ids of every node imported from Canvas, so the
 * Canvas sidebar tab knows which selections it can claim (one request, then
 * cached client-side until the tree refreshes).
 */

import { linkedContentIds } from "@/lib/domain/canvas/server/service";
import { canvasRoute } from "@/lib/domain/canvas/server/route";

export const GET = canvasRoute("/api/canvas/linked", async ({ ownerId }) => ({
  ids: await linkedContentIds(ownerId),
}));
