/**
 * POST /api/publishing/items/[id]/schedule
 * Body: { scheduledFor: ISO string }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { prisma } from "@/lib/database/client";
import { logger } from "@/lib/core/logger";
import { withRouteTrace } from "@/lib/core/logger/route-trace";
import { withSpan } from "@/lib/core/logger/span";
import { spanPayload } from "@/lib/core/logger/span-payload";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withRouteTrace(
    req,
    { route: "/api/publishing/items/[id]/schedule" },
    async () => {
      const session = await requireAuth();
      const { id } = await params;
      const body = (await req.json()) as { scheduledFor: string };
      const { scheduledFor } = body;

      if (!scheduledFor) {
        logger.warn({
          layer: "content",
          event: "publishing_schedule:rejected",
          summary: "scheduledFor missing",
          attrs: { public_item_id: id, reason: "validation_error" },
        });
        return NextResponse.json({ error: "scheduledFor required" }, { status: 400 });
      }

      const date = new Date(scheduledFor);
      if (isNaN(date.getTime()) || date <= new Date()) {
        logger.warn({
          layer: "content",
          event: "publishing_schedule:rejected",
          summary: "scheduledFor must be a future date",
          attrs: { public_item_id: id, scheduled_for: scheduledFor },
        });
        return NextResponse.json(
          { error: "scheduledFor must be a future date" },
          { status: 400 },
        );
      }

      return withSpan(
        { layer: "content", name: "publishing:schedule" },
        {
          summary: "publishing item schedule",
          attrs: { public_item_id: id, scheduled_for: date.toISOString() },
        },
        async (span) => {
          const item = await prisma.publicItem.findFirst({
            where: { id, tenant: { ownerId: session.user.id }, deletedAt: null },
          });

          if (!item) {
            logger.warn({
              layer: "content",
              event: "publishing_schedule:rejected",
              summary: "public item not found",
              attrs: { public_item_id: id },
            });
            return NextResponse.json({ error: "Not found" }, { status: 404 });
          }
          if (item.state === "archived") {
            logger.warn({
              layer: "content",
              event: "publishing_schedule:rejected",
              summary: "cannot schedule archived item",
              attrs: { public_item_id: id, state: item.state },
            });
            return NextResponse.json(
              { error: "Cannot schedule an archived item" },
              { status: 422 },
            );
          }

          await prisma.publicItem.update({
            where: { id },
            data: { state: "scheduled", scheduledFor: date },
          });

          await spanPayload(span, "schedule_payload", {
            scheduledFor: date.toISOString(),
            previousState: item.state,
          });

          return NextResponse.json({ ok: true, scheduledFor: date.toISOString() });
        },
      );
    },
  );
}
