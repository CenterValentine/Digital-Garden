/**
 * POST /api/publishing/items/[id]/unpublish
 * Transitions state: published → unpublished. Content stays; just goes dark.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { prisma } from "@/lib/database/client";
import { logger } from "@/lib/core/logger";
import { withRouteTrace } from "@/lib/core/logger/route-trace";
import { withSpan } from "@/lib/core/logger/span";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withRouteTrace(
    req,
    { route: "/api/publishing/items/[id]/unpublish" },
    async () => {
      const session = await requireAuth();
      const { id } = await params;

      return withSpan(
        { layer: "content", name: "publishing:unpublish" },
        { summary: "publishing item unpublish", attrs: { public_item_id: id } },
        async (span) => {
          const item = await prisma.publicItem.findFirst({
            where: { id, tenant: { ownerId: session.user.id }, deletedAt: null },
          });

          if (!item) {
            logger.warn({
              layer: "content",
              event: "publishing_unpublish:rejected",
              summary: "public item not found",
              attrs: { public_item_id: id },
            });
            return NextResponse.json({ error: "Not found" }, { status: 404 });
          }
          if (item.state !== "published") {
            logger.warn({
              layer: "content",
              event: "publishing_unpublish:rejected",
              summary: "item not currently published",
              attrs: { public_item_id: id, state: item.state },
            });
            return NextResponse.json(
              { error: "Item is not currently published" },
              { status: 422 },
            );
          }

          await prisma.publicItem.update({
            where: { id },
            data: { state: "unpublished" },
          });

          span.attr("prev_state", item.state).attr("new_state", "unpublished");

          return NextResponse.json({ ok: true });
        },
      );
    },
  );
}
