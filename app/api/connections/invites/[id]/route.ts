/**
 * Connection invites API — single invite.
 *
 * DELETE /api/connections/invites/[id] — revoke own pending invite
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import { revokeInvite } from "@/lib/domain/connections";
import { handleConnectionsRouteError } from "@/lib/domain/connections/route-errors";
import { withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/connections/invites/[id]";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const { id } = await context.params;
      await revokeInvite(session.user.id, id, request);
      return NextResponse.json({ success: true, data: { id } });
    } catch (error) {
      return handleConnectionsRouteError("connections_invite_revoke", error);
    }
  });
}
