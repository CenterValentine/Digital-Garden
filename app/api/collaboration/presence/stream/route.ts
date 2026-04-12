import { NextRequest } from "next/server";

import { prisma } from "@/lib/database/client";
import { resolveContentAccess } from "@/lib/domain/collaboration/access";
import {
  listCollaborationPresence,
  subscribeCollaborationPresence,
} from "@/lib/domain/collaboration/presence-server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await requireAuth();
  const contentId = request.nextUrl.searchParams.get("contentId")?.trim();

  if (!contentId) {
    return new Response("contentId is required", { status: 400 });
  }

  await resolveContentAccess(prisma, {
    contentId,
    userId: session.user.id,
    require: "view",
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = () => {
        const sessions = listCollaborationPresence(contentId);
        controller.enqueue(
          encoder.encode(
            `event: presence\ndata: ${JSON.stringify({
              type: "presence",
              contentId,
              sessions,
            })}\n\n`
          )
        );
      };

      const unsubscribe = subscribeCollaborationPresence(contentId, send);
      const interval = setInterval(send, 5000);
      const close = () => {
        clearInterval(interval);
        unsubscribe();
        controller.close();
      };

      request.signal.addEventListener("abort", close, { once: true });
      send();
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
