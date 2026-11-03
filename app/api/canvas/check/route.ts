/**
 * POST /api/canvas/check  { courseRootId, cartridgeContentId? }
 * "Check for changes" (CANVAS-ARCHIVE-PLAN.md §9.1): compares Canvas's
 * current versions with what was imported. Nothing is written. A course that
 * came from an export needs a newer export to compare against.
 */

import { z } from "zod";
import { checkCourse } from "@/lib/domain/canvas/server/service";
import { canvasRoute } from "@/lib/domain/canvas/server/route";

export const maxDuration = 120;

const bodySchema = z.object({
  courseRootId: z.string().uuid(),
  cartridgeContentId: z.string().uuid().nullish(),
});

export const POST = canvasRoute("/api/canvas/check", async ({ ownerId, request }) => {
  const body = bodySchema.parse(await request.json());
  return checkCourse({ ownerId, courseRootId: body.courseRootId, cartridgeContentId: body.cartridgeContentId });
});
