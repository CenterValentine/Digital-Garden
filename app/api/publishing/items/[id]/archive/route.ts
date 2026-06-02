/**
 * POST /api/publishing/items/[id]/archive
 *
 * Transitions state: * → archived. Stronger than unpublish: signals the
 * author considers the item retired, not just temporarily dark. Archived
 * items don't appear in the IDE's working set unless explicitly filtered.
 * Different from delete — the row stays in the DB and can be restored by
 * re-publishing.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { prisma } from "@/lib/database/client";
import { logger } from "@/lib/core/logger";
import { withRouteTrace } from "@/lib/core/logger/route-trace";
import { withSpan } from "@/lib/core/logger/span";
import { invalidateTenantCache } from "@/lib/domain/tenancy/cache";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withRouteTrace(
    req,
    { route: "/api/publishing/items/[id]/archive" },
    async () => {
      const session = await requireAuth();
      const { id } = await params;

      return withSpan(
        { layer: "content", name: "publishing:archive" },
        { summary: "publishing item archive", attrs: { public_item_id: id } },
        async (span) => {
          const item = await prisma.publicItem.findFirst({
            where: { id, tenant: { ownerId: session.user.id }, deletedAt: null },
          });

          if (!item) {
            logger.warn({
              layer: "content",
              event: "publishing_archive:rejected",
              summary: "public item not found",
              attrs: { public_item_id: id },
            });
            return NextResponse.json({ error: "Not found" }, { status: 404 });
          }

          if (item.state === "archived") {
            return NextResponse.json({ ok: true, alreadyArchived: true });
          }

          await prisma.publicItem.update({
            where: { id },
            data: { state: "archived" },
          });

          span.attr("prev_state", item.state).attr("new_state", "archived");

          // If it was published, the public surface needs invalidation.
          if (item.state === "published") {
            await invalidateTenantCache({ type: "item", itemId: id });
          }

          return NextResponse.json({ ok: true });
        },
      );
    },
  );
}
