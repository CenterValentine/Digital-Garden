/**
 * POST /api/canvas/import  { connectionId, courseId, parentId? }
 * Import one course from the Canvas API into the folder `parentId` (or the
 * top of the tree). Streams NDJSON progress; the last line is the summary.
 * Running it again on an imported course re-imports every module, with any
 * conflicts kept as your version (the Canvas sidebar tab lets you choose).
 */

import { z } from "zod";
import { importCourse } from "@/lib/domain/canvas/server/service";
import { canvasStreamRoute } from "@/lib/domain/canvas/server/route";

export const maxDuration = 300;

const bodySchema = z.object({
  connectionId: z.string().uuid(),
  courseId: z.string().regex(/^\d+$/, "Invalid course id"),
  parentId: z.string().uuid().nullish(),
});

export const POST = canvasStreamRoute(
  "/api/canvas/import",
  (body) => bodySchema.parse(body),
  ({ ownerId, body, emit }) =>
    importCourse({
      ownerId,
      connectionId: body.connectionId,
      courseId: body.courseId,
      parentId: body.parentId ?? null,
      emit,
    })
);
