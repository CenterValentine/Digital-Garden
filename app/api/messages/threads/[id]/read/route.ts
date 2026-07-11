/**
 * Messages API — explicit mark-read.
 *
 * POST /api/messages/threads/[id]/read — called on thread open/close; sets
 * the participant's lastReadAt cursor and clears the thread's "dm.message"
 * notifications so the bell badge stays coherent.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import { markThreadRead } from "@/lib/domain/messaging";
import { handleMessagingRouteError } from "@/lib/domain/messaging/route-errors";
import { withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/messages/threads/[id]/read";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const { id } = await context.params;
      await markThreadRead(session.user.id, id);
      return NextResponse.json({ success: true, data: { id } });
    } catch (error) {
      return handleMessagingRouteError("messages_thread_read", error);
    }
  });
}
