/**
 * Connection invites API.
 *
 * POST /api/connections/invites — send an invite by exact email/username
 *   body: { identifier: string; message?: string }
 *   Response is enumeration-safe: identical whether or not the identifier
 *   resolves to a real account.
 * GET  /api/connections/invites — list sent + received pending invites
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/infrastructure/auth";
import { listInvites, sendInvite } from "@/lib/domain/connections";
import { handleConnectionsRouteError } from "@/lib/domain/connections/route-errors";
import { withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/connections/invites";

const sendInviteSchema = z.object({
  identifier: z.string().trim().min(3).max(255),
  message: z.string().trim().max(280).optional(),
});

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const body = sendInviteSchema.parse(await request.json());
      const result = await sendInvite(
        session.user.id,
        body.identifier,
        body.message,
        request,
      );
      return NextResponse.json({ success: true, data: result });
    } catch (error) {
      return handleConnectionsRouteError("connections_invite_send", error);
    }
  });
}

export async function GET(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const invites = await listInvites(session.user.id);
      return NextResponse.json({ success: true, data: invites });
    } catch (error) {
      return handleConnectionsRouteError("connections_invite_list", error);
    }
  });
}
