import { NextRequest } from "next/server";

import { prisma } from "@/lib/database/client";
import { assertCachedPresenceAccess } from "@/lib/domain/collaboration/presence-access-cache";
import {
  listCollaborationPresence,
  subscribeCollaborationPresence,
} from "@/lib/domain/collaboration/presence-server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";

export const runtime = "nodejs";

const PRESENCE_STREAM_REFRESH_MS = 10_000;

export async function GET(request: NextRequest) {
  const session = await requireAuth();
  const contentId = request.nextUrl.searchParams.get("contentId")?.trim();

  if (!contentId) {
    return new Response("contentId is required", { status: 400 });
  }

  await assertCachedPresenceAccess(prisma, {
    contentId,
    userId: session.user.id,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let isClosed = false;
      let isSending = false;
      const send = async () => {
        if (isClosed || isSending) return;
        isSending = true;
        try {
          const sessions = await listCollaborationPresence(prisma, contentId);
          if (isClosed) return;
          controller.enqueue(
            encoder.encode(
              `event: presence\ndata: ${JSON.stringify({
                type: "presence",
                contentId,
                sessions,
              })}\n\n`
            )
          );
        } finally {
          isSending = false;
        }
      };

      const unsubscribe = subscribeCollaborationPresence(contentId, () => {
        void send();
      });
      const interval = setInterval(() => {
        void send();
      }, PRESENCE_STREAM_REFRESH_MS);
      const close = () => {
        isClosed = true;
        clearInterval(interval);
        unsubscribe();
        controller.close();
      };

      request.signal.addEventListener("abort", close, { once: true });
      void send();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
