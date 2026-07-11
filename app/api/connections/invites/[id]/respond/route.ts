/**
 * Connection invites API — respond.
 *
 * POST /api/connections/invites/[id]/respond
 *   body: { action: "accept" | "decline" }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/infrastructure/auth";
import { respondToInvite } from "@/lib/domain/connections";
import { handleConnectionsRouteError } from "@/lib/domain/connections/route-errors";
import { withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/connections/invites/[id]/respond";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const respondSchema = z.object({
  action: z.enum(["accept", "decline"]),
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
      const body = respondSchema.parse(await request.json());
      const result = await respondToInvite(
        session.user.id,
        id,
        body.action,
        request,
      );
      return NextResponse.json({ success: true, data: result });
    } catch (error) {
      return handleConnectionsRouteError("connections_invite_respond", error);
    }
  });
}
