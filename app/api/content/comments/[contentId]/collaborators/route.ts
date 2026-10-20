/**
 * GET /api/content/comments/[contentId]/collaborators → who can be @mentioned:
 * the note's owner plus every user holding a live grant. Viewer must have
 * view access themselves.
 */

import { commentsRoute } from "@/lib/domain/comments/server/route";
import { listCollaborators, listThreads } from "@/lib/domain/comments/server/threads";

const ROUTE = "/api/content/comments/[contentId]/collaborators";
type Params = { contentId: string };

export const GET = commentsRoute<Params, { collaborators: Awaited<ReturnType<typeof listCollaborators>> }>(ROUTE, async ({ userId, params }) => {
  // listThreads performs the access check (404 for a note the caller cannot view).
  await listThreads(userId, params.contentId, new Date(8.64e15 - 1));
  return { collaborators: await listCollaborators(params.contentId) };
});
