/**
 * Conversation events SSE — Session 4b.
 *
 * GET /api/conversations/events
 *
 * Server-Sent Events stream of the authenticated user's conversation
 * mutations (created / updated / deleted / message appended / association
 * changed). The client cache store subscribes once and fans events out
 * to every chat surface (sidebar tabs, full-page viewer header, picker).
 *
 * Transport notes:
 *   - Real events come from the in-process bus (instant, same-instance).
 *   - A periodic heartbeat comment keeps the connection alive through
 *     proxies that idle-timeout silent streams.
 *   - Cross-instance fallback (a mutation on a different serverless
 *     instance) is handled client-side: the cache store refetches on
 *     window focus. The bus + heartbeat cover the warm-instance case,
 *     which is the overwhelming majority.
 */

import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { subscribeConversationEvents } from "@/lib/features/conversations/events";
import { CONVERSATION_SSE_EVENT } from "@/lib/features/conversations/event-types";

export const runtime = "nodejs";

const HEARTBEAT_MS = 25_000;

export async function GET(request: NextRequest) {
  const session = await requireAuth();
  const userId = session.user.id;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let isClosed = false;

      const safeEnqueue = (chunk: string) => {
        if (isClosed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          /* controller may already be closing — ignore */
        }
      };

      // Initial comment flushes headers and confirms the stream is open.
      safeEnqueue(`: connected\n\n`);

      const unsubscribe = subscribeConversationEvents(userId, (event) => {
        safeEnqueue(
          `event: ${CONVERSATION_SSE_EVENT}\ndata: ${JSON.stringify(event)}\n\n`,
        );
      });

      const heartbeat = setInterval(() => {
        safeEnqueue(`: ping\n\n`);
      }, HEARTBEAT_MS);

      const close = () => {
        if (isClosed) return;
        isClosed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      request.signal.addEventListener("abort", close, { once: true });
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
