/**
 * GET  /api/reader/annotations?targetKey=… → highlights / notes / bookmarks
 * POST /api/reader/annotations { targetKey, kind, locator, color?, body? }
 */

import {
  createAnnotation,
  createAnnotationSchema,
  listAnnotations,
  targetKeySchema,
} from "@/lib/domain/reader/server/annotations";
import { readerRoute } from "@/lib/domain/reader/server/route";

const ROUTE = "/api/reader/annotations";

export const GET = readerRoute(ROUTE, async ({ ownerId, request }) => {
  const targetKey = targetKeySchema.parse(new URL(request.url).searchParams.get("targetKey"));
  return { annotations: await listAnnotations(ownerId, targetKey) };
});

export const POST = readerRoute(ROUTE, async ({ ownerId, request }) => {
  const body = createAnnotationSchema.parse(await request.json());
  return { annotation: await createAnnotation(ownerId, body) };
});
