/**
 * GET /api/canvas/courses?connectionId=
 * Your past and current Canvas courses, each marked when already imported.
 */

import { listCourses } from "@/lib/domain/canvas/server/service";
import { canvasRoute } from "@/lib/domain/canvas/server/route";

export const GET = canvasRoute("/api/canvas/courses", async ({ ownerId, request }) =>
  listCourses(ownerId, request.nextUrl.searchParams.get("connectionId"))
);
