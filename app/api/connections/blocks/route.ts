/**
 * Blocks API.
 *
 * GET  /api/connections/blocks — list users the current user has blocked
 * POST /api/connections/blocks — block a user
 *   body: { userId: string }
 *   Targets come from existing relationship artifacts (invites, connections,
 *   DM senders) — there is no user search.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/infrastructure/auth";
import { blockUser, listBlocks } from "@/lib/domain/connections";
import { handleConnectionsRouteError } from "@/lib/domain/connections/route-errors";
import { withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/connections/blocks";

const blockSchema = z.object({
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
      const blocks = await listBlocks(session.user.id);
      return NextResponse.json({ success: true, data: { blocks } });
    } catch (error) {
      return handleConnectionsRouteError("connections_blocks_list", error);
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
      const body = blockSchema.parse(await request.json());
      const block = await blockUser(session.user.id, body.userId, request);
      return NextResponse.json({ success: true, data: block });
    } catch (error) {
      return handleConnectionsRouteError("connections_block_create", error);
    }
  });
}
