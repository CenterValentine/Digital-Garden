import { NextRequest, NextResponse } from "next/server";

import { withRouteTrace } from "@/lib/core/logger";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { createNativeN8nFlow } from "@/extensions/workflows/server/engines/n8n/native";
import { handleRouteError } from "@/extensions/workflows/server/http";

const ROUTE_PATH = "/api/workflows/n8n/create";

/**
 * Create an "n8n Flow" — a workflow authored in n8n's own editor, linked from a
 * DG ContentNode. Session-authed. Returns the new content id + a deep link to
 * the n8n editor.
 */
export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await requireAuth();
      const body = (await request.json().catch(() => ({}))) as {
        parentId?: unknown;
        title?: unknown;
      };
      const result = await createNativeN8nFlow(session.user.id, {
        parentId: typeof body.parentId === "string" ? body.parentId : null,
        title: typeof body.title === "string" ? body.title : undefined,
      });
      return NextResponse.json({ success: true, data: result }, { status: 201 });
    } catch (error) {
      return handleRouteError(error, "Failed to create n8n flow");
    }
  });
}
