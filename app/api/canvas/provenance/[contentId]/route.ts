/**
 * GET /api/canvas/provenance/:contentId → where an imported node came from
 * (course, module, "open in Canvas", import date), or null for other nodes.
 */

import { z } from "zod";
import { provenance } from "@/lib/domain/canvas/server/service";
import { canvasRouteWithParams } from "@/lib/domain/canvas/server/route";

export const GET = canvasRouteWithParams<{ contentId: string }, unknown>(
  "/api/canvas/provenance/[contentId]",
  async ({ ownerId, params }) => ({
    provenance: await provenance(ownerId, z.string().uuid().parse(params.contentId)),
  })
);
