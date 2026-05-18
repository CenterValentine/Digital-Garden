/**
 * GET /api/publishing/items/[id]/revisions — list all revisions for an item, newest first
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { prisma } from "@/lib/database/client";
import { logger } from "@/lib/core/logger";
import { withRouteTrace } from "@/lib/core/logger/route-trace";
import { withSpan } from "@/lib/core/logger/span";
import { spanPayload } from "@/lib/core/logger/span-payload";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withRouteTrace(
    req,
    { route: "/api/publishing/items/[id]/revisions" },
    async () => {
      const session = await requireAuth();
      const { id } = await params;

      return withSpan(
        { layer: "content", name: "publishing:revisions_list" },
        { summary: "publishing revisions list", attrs: { public_item_id: id } },
        async (span) => {
          // Verify ownership
          const item = await prisma.publicItem.findFirst({
            where: { id, ownerId: session.user.id, deletedAt: null },
            select: {
              id: true,
              workingRevisionId: true,
              publishedRevisionId: true,
            },
          });
          if (!item) {
            logger.warn({
              layer: "content",
              event: "publishing_revisions_list:rejected",
              summary: "public item not found",
              attrs: { public_item_id: id },
            });
            return NextResponse.json({ error: "Not found" }, { status: 404 });
          }

          const revisions = await prisma.publicItemRevision.findMany({
            where: { publicItemId: id },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              createdAt: true,
              publishedAt: true,
              bodyHash: true,
              ogTitle: true,
              note: true,
              wordCount: true,
              readingTimeMinutes: true,
            },
          });

          const result = {
            revisions: revisions.map((r) => ({
              ...r,
              isWorking: r.id === item.workingRevisionId,
              isPublished: r.id === item.publishedRevisionId,
            })),
          };

          span.attr("revision_count", revisions.length);
          await spanPayload(span, "revisions_response", result);

          return NextResponse.json(result);
        },
      );
    },
  );
}
