/**
 * GET   /api/publishing/items/[id]  — fetch a single PublicItem with all payloads
 * PATCH /api/publishing/items/[id]  — update publicTitle, publicTags, slug, pathId
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
  return withRouteTrace(req, { route: "/api/publishing/items/[id]" }, async () => {
    const session = await requireAuth();
    const { id } = await params;

    return withSpan(
      { layer: "content", name: "publishing:read" },
      { summary: "publishing item read", attrs: { public_item_id: id } },
      async (span) => {
        const item = await prisma.publicItem.findFirst({
          where: { id, ownerId: session.user.id, deletedAt: null },
          include: {
            path: true,
            series: true,
            workingRevision: true,
            publishedRevision: true,
            blogPostPayload: true,
            projectPayload: true,
            profileSectionPayload: true,
            caseStudyPayload: true,
            bookmarkPayload: true,
            pagePayload: true,
            mediaItemPayload: true,
          },
        });

        if (!item) {
          logger.warn({
            layer: "content",
            event: "publishing_item_read:rejected",
            summary: "public item not found",
            attrs: { public_item_id: id },
          });
          return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        const result = {
          ...item,
          hasPendingChanges:
            item.workingRevision !== null &&
            item.publishedRevision !== null &&
            item.workingRevision.bodyHash !== item.publishedRevision.bodyHash,
        };

        span.attr("payload_type", item.payloadType).attr("state", item.state);
        await spanPayload(span, "item_response", result);

        return NextResponse.json(result);
      },
    );
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withRouteTrace(req, { route: "/api/publishing/items/[id]" }, async () => {
    const session = await requireAuth();
    const { id } = await params;

    return withSpan(
      { layer: "content", name: "publishing:update" },
      { summary: "publishing item update", attrs: { public_item_id: id } },
      async (span) => {
        const item = await prisma.publicItem.findFirst({
          where: { id, ownerId: session.user.id, deletedAt: null },
        });
        if (!item) {
          logger.warn({
            layer: "content",
            event: "publishing_item_update:rejected",
            summary: "public item not found",
            attrs: { public_item_id: id },
          });
          return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        const body = (await req.json()) as {
          publicTitle?: string;
          publicTags?: string[];
          slug?: string;
          pathId?: string;
          seriesId?: string | null;
          seriesOrder?: number | null;
        };
        const { publicTitle, publicTags, slug, pathId, seriesId, seriesOrder } = body;
        await spanPayload(span, "incoming_body", body);

        // Validate slug uniqueness if changing slug or path
        if (slug !== undefined || pathId !== undefined) {
          const targetSlug = slug ?? item.slug;
          const targetPathId = pathId ?? item.pathId;
          const conflict = await prisma.publicItem.findFirst({
            where: {
              pathId: targetPathId,
              slug: targetSlug,
              id: { not: id },
              deletedAt: null,
            },
          });
          if (conflict) {
            logger.warn({
              layer: "content",
              event: "publishing_item_update:rejected",
              summary: "slug conflict in path",
              attrs: {
                public_item_id: id,
                target_path_id: targetPathId,
                target_slug: targetSlug,
              },
            });
            return NextResponse.json(
              { error: "Slug already used in this path" },
              { status: 409 },
            );
          }
        }

        const updated = await prisma.publicItem.update({
          where: { id },
          data: {
            ...(publicTitle !== undefined && { publicTitle }),
            ...(publicTags !== undefined && { publicTags }),
            ...(slug !== undefined && { slug }),
            ...(pathId !== undefined && { pathId }),
            ...(seriesId !== undefined && { seriesId }),
            ...(seriesOrder !== undefined && { seriesOrder }),
            // Reset validation when metadata changes
            validationStatus: "unchecked",
          },
        });

        await spanPayload(span, "updated_item", updated);

        return NextResponse.json(updated);
      },
    );
  });
}
