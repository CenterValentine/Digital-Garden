/**
 * PATCH  /api/reader/annotations/[id] { color?, body? }
 * DELETE /api/reader/annotations/[id]
 */

import {
  deleteAnnotation,
  updateAnnotation,
  updateAnnotationSchema,
} from "@/lib/domain/reader/server/annotations";
import { readerRouteWithParams } from "@/lib/domain/reader/server/route";

const ROUTE = "/api/reader/annotations/[id]";

export const PATCH = readerRouteWithParams<{ id: string }, unknown>(
  ROUTE,
  async ({ ownerId, params, request }) => {
    const body = updateAnnotationSchema.parse(await request.json());
    return { annotation: await updateAnnotation(ownerId, params.id, body) };
  }
);

export const DELETE = readerRouteWithParams<{ id: string }, unknown>(
  ROUTE,
  async ({ ownerId, params }) => {
    await deleteAnnotation(ownerId, params.id);
    return { deleted: true };
  }
);
