/**
 * POST /api/canvas/reimport
 *   { courseRootId, moduleIds, includeCourse, resolutions, cartridgeContentId? }
 * Re-import the modules the user ticked (§9.2). `resolutions` settles every
 * conflict in one pass: "skip" keeps your version, "sibling" adds the Canvas
 * version beside it. Streams NDJSON progress; the last line is the summary.
 */

import { z } from "zod";
import { reimportCourse } from "@/lib/domain/canvas/server/service";
import { canvasStreamRoute } from "@/lib/domain/canvas/server/route";

export const maxDuration = 300;

const bodySchema = z.object({
  courseRootId: z.string().uuid(),
  moduleIds: z.array(z.string().min(1).max(128)).max(500),
  includeCourse: z.boolean(),
  resolutions: z.record(z.string().max(255), z.enum(["skip", "sibling"])).default({}),
  cartridgeContentId: z.string().uuid().nullish(),
});

export const POST = canvasStreamRoute(
  "/api/canvas/reimport",
  (body) => bodySchema.parse(body),
  ({ ownerId, body, emit }) =>
    reimportCourse({
      ownerId,
      courseRootId: body.courseRootId,
      moduleIds: body.moduleIds,
      includeCourse: body.includeCourse,
      resolutions: body.resolutions,
      cartridgeContentId: body.cartridgeContentId,
      emit,
    })
);
