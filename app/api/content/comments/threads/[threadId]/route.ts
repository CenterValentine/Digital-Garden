/**
 * POST   /api/content/comments/threads/[threadId] { body, mentions? } → reply
 * PATCH  /api/content/comments/threads/[threadId] { resolved }        → resolve / reopen
 * DELETE /api/content/comments/threads/[threadId]                     → delete the thread
 */

import { commentsRoute } from "@/lib/domain/comments/server/route";
import {
  deleteThread,
  replySchema,
  replyToThread,
  resolveSchema,
  setThreadResolved,
} from "@/lib/domain/comments/server/threads";

const ROUTE = "/api/content/comments/threads/[threadId]";
type Params = { threadId: string };

export const POST = commentsRoute<Params, { thread: Awaited<ReturnType<typeof replyToThread>> }>(ROUTE, async ({ userId, request, params }) => {
  const input = replySchema.parse(await request.json());
  return { thread: await replyToThread(userId, params.threadId, input) };
});

export const PATCH = commentsRoute<Params, { thread: Awaited<ReturnType<typeof setThreadResolved>> }>(ROUTE, async ({ userId, request, params }) => {
  const { resolved } = resolveSchema.parse(await request.json());
  return { thread: await setThreadResolved(userId, params.threadId, resolved) };
});

export const DELETE = commentsRoute<Params, { deleted: true }>(ROUTE, async ({ userId, params }) => {
  await deleteThread(userId, params.threadId);
  return { deleted: true as const };
});
