/**
 * GET  /api/content/comments/[contentId]?since=<iso> → the note's threads (with comments)
 * POST /api/content/comments/[contentId] { id, body, anchor?, mentions? } → a new thread
 */

import { commentsRoute } from "@/lib/domain/comments/server/route";
import { createThread, createThreadSchema, listQuerySchema, listThreads } from "@/lib/domain/comments/server/threads";

const ROUTE = "/api/content/comments/[contentId]";
type Params = { contentId: string };

export const GET = commentsRoute<Params, { threads: Awaited<ReturnType<typeof listThreads>> }>(ROUTE, async ({ userId, request, params }) => {
  const { since } = listQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  return { threads: await listThreads(userId, params.contentId, since ? new Date(since) : undefined) };
});

export const POST = commentsRoute<Params, { thread: Awaited<ReturnType<typeof createThread>> }>(ROUTE, async ({ userId, request, params }) => {
  const input = createThreadSchema.parse(await request.json());
  return { thread: await createThread(userId, params.contentId, input) };
});
