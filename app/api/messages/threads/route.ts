/**
 * Messages API — threads.
 *
 * GET  /api/messages/threads — thread list with per-thread unread counts
 * POST /api/messages/threads — get-or-create a thread with a connected user
 *   body: { userId: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/infrastructure/auth";
import { getOrCreateThread, listThreads } from "@/lib/domain/messaging";
import { handleMessagingRouteError } from "@/lib/domain/messaging/route-errors";
import { withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/messages/threads";

const createThreadSchema = z.object({
  userId: z.string().uuid(),
});

export async function GET(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const threads = await listThreads(session.user.id);
      return NextResponse.json({ success: true, data: { threads } });
    } catch (error) {
      return handleMessagingRouteError("messages_thread_list", error);
    }
  });
}

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const body = createThreadSchema.parse(await request.json());
      const thread = await getOrCreateThread(session.user.id, body.userId);
      return NextResponse.json({ success: true, data: thread });
    } catch (error) {
      return handleMessagingRouteError("messages_thread_create", error);
    }
  });
}
