/**
 * Notifications API — single-item state.
 *
 * PATCH /api/notifications/[id]
 *   body: { read?: boolean; archived?: boolean }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/infrastructure/auth";
import { prisma } from "@/lib/database/client";
import { setArchived, setReadState } from "@/lib/domain/notifications";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/notifications/[id]";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const patchSchema = z
  .object({
    read: z.boolean().optional(),
    archived: z.boolean().optional(),
  })
  .refine((body) => body.read !== undefined || body.archived !== undefined, {
    message: "Provide at least one of: read, archived",
  });

export async function PATCH(request: NextRequest, context: RouteContext) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );

      const { id } = await context.params;
      const body = patchSchema.parse(await request.json());

      let found = false;
      if (body.read !== undefined) {
        found = await setReadState(prisma, session.user.id, id, body.read);
      }
      if (body.archived !== undefined) {
        found = await setArchived(prisma, session.user.id, id, body.archived);
      }

      if (!found) {
        return NextResponse.json(
          { success: false, error: "Notification not found" },
          { status: 404 },
        );
      }
      return NextResponse.json({ success: true, data: { id } });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message === "Unauthorized" ||
          error.message === "Authentication required")
      ) {
        return NextResponse.json(
          { success: false, error: "Unauthorized" },
          { status: 401 },
        );
      }
      if (error instanceof Error && error.name === "ZodError") {
        return NextResponse.json(
          { success: false, error: "Invalid request", details: error.message },
          { status: 400 },
        );
      }
      logger.error({
        layer: "content",
        event: "notifications_patch:caught",
        summary: "PATCH caught — translated to 500",
        error,
      });
      return NextResponse.json(
        { success: false, error: "Failed to update notification" },
        { status: 500 },
      );
    }
  });
}
