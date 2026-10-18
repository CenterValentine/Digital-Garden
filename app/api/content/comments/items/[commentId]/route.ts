/**
 * PATCH  /api/content/comments/items/[commentId] { body } → edit own comment
 * DELETE /api/content/comments/items/[commentId]          → delete own comment
 *        (the last live comment takes its thread with it → `threadDeleted`)
 */

import { commentsRoute } from "@/lib/domain/comments/server/route";
import { deleteComment, editCommentSchema, updateComment } from "@/lib/domain/comments/server/threads";

const ROUTE = "/api/content/comments/items/[commentId]";
type Params = { commentId: string };

export const PATCH = commentsRoute<Params, { thread: Awaited<ReturnType<typeof updateComment>> }>(ROUTE, async ({ userId, request, params }) => {
  const { body } = editCommentSchema.parse(await request.json());
  return { thread: await updateComment(userId, params.commentId, body) };
});

export const DELETE = commentsRoute<Params, Awaited<ReturnType<typeof deleteComment>>>(ROUTE, async ({ userId, params }) =>
  deleteComment(userId, params.commentId),
);
