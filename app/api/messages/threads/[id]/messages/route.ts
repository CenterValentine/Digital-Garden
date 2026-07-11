/**
 * Messages API — send.
 *
 * POST /api/messages/threads/[id]/messages
 *   body: { body: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/infrastructure/auth";
import { sendMessage } from "@/lib/domain/messaging";
import { handleMessagingRouteError } from "@/lib/domain/messaging/route-errors";
import { withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/messages/threads/[id]/messages";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const sendSchema = z.object({
  body: z.string().min(1).max(4000),
});

export async function POST(request: NextRequest, context: RouteContext) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const { id } = await context.params;
      const body = sendSchema.parse(await request.json());
      const message = await sendMessage(session.user.id, id, body.body);
      return NextResponse.json({ success: true, data: message });
    } catch (error) {
      return handleMessagingRouteError("messages_send", error);
    }
  });
}
