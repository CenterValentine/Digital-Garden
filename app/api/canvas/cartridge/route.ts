/**
 * POST /api/canvas/cartridge  { fileContentId, parentId? }
 * Import a course from a Common Cartridge export (.imscc) the client already
 * uploaded as a file node (two-phase upload, so large exports skip the
 * function body limit). Streams NDJSON progress like /api/canvas/import.
 */

import { z } from "zod";
import { importCartridge } from "@/lib/domain/canvas/server/service";
import { canvasStreamRoute } from "@/lib/domain/canvas/server/route";

export const maxDuration = 300;

const bodySchema = z.object({
  fileContentId: z.string().uuid(),
  parentId: z.string().uuid().nullish(),
});

export const POST = canvasStreamRoute(
  "/api/canvas/cartridge",
  (body) => bodySchema.parse(body),
  ({ ownerId, body, emit }) =>
    importCartridge({ ownerId, fileContentId: body.fileContentId, parentId: body.parentId ?? null, emit })
);
