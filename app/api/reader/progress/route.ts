/**
 * GET /api/reader/progress?targetKey=… → last position (or null)
 * PUT /api/reader/progress { targetKey, locator, percent }
 */

import { z } from "zod";
import {
  getProgress,
  locatorSchema,
  saveProgress,
  targetKeySchema,
} from "@/lib/domain/reader/server/annotations";
import { readerRoute } from "@/lib/domain/reader/server/route";

const ROUTE = "/api/reader/progress";

export const GET = readerRoute(ROUTE, async ({ ownerId, request }) => {
  const targetKey = targetKeySchema.parse(new URL(request.url).searchParams.get("targetKey"));
  return { progress: await getProgress(ownerId, targetKey) };
});

const putSchema = z.object({
  targetKey: targetKeySchema,
  locator: locatorSchema,
  percent: z.number().min(0).max(1),
});

export const PUT = readerRoute(ROUTE, async ({ ownerId, request }) => {
  const body = putSchema.parse(await request.json());
  return { progress: await saveProgress(ownerId, body.targetKey, body.locator, body.percent) };
});
