/**
 * GET  /api/publishing/items?contentNodeId=...  — PublicItems linked to a ContentNode
 * POST /api/publishing/items                     — create a new PublicItem (add to publishing)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { prisma } from "@/lib/database/client";
import { logger } from "@/lib/core/logger";
import { withRouteTrace } from "@/lib/core/logger/route-trace";
import { withSpan } from "@/lib/core/logger/span";
import { spanPayload } from "@/lib/core/logger/span-payload";
import { resolveWritableTenantId, TenantAuthError } from "@/lib/domain/tenancy/api";
import { invalidateTenantCache } from "@/lib/domain/tenancy/cache";

export async function GET(req: NextRequest) {
  return withRouteTrace(req, { route: "/api/publishing/items" }, async () => {
    const session = await requireAuth();

    const { searchParams } = new URL(req.url);
    const contentNodeId = searchParams.get("contentNodeId");

    if (!contentNodeId) {
      logger.warn({
        layer: "content",
        event: "publishing_items_list:rejected",
        summary: "contentNodeId missing",
        attrs: { reason: "validation_error" },
      });
      return NextResponse.json({ error: "contentNodeId required" }, { status: 400 });
    }

    return withSpan(
      { layer: "content", name: "publishing:list" },
      { summary: "publishing items list", attrs: { content_node_id: contentNodeId } },
      async (span) => {
        // Scope by tenant ownership rather than ownerId so that listing
        // an item linked to a ContentNode finds copies on any tenant the
        // user owns (a node can be published to multiple of the user's
        // sites — one PublicItem per site).
        const items = await prisma.publicItem.findMany({
          where: {
            tenant: { ownerId: session.user.id },
            contentNodeId,
            deletedAt: null,
          },
          include: {
            path: { select: { id: true, slug: true, title: true } },
            workingRevision: { select: { id: true, bodyHash: true, metadataHash: true } },
            publishedRevision: { select: { id: true, bodyHash: true, metadataHash: true } },
            tenant: { select: { id: true, slug: true, displayName: true } },
          },
          orderBy: { createdAt: "asc" },
        });

        const result = items.map((item) => ({
          id: item.id,
          contentNodeId: item.contentNodeId,
          pathId: item.pathId,
          slug: item.slug,
          payloadType: item.payloadType,
          publicTitle: item.publicTitle,
          state: item.state,
          validationStatus: item.validationStatus,
          validationIssues: item.validationIssues,
          firstPublishedAt: item.firstPublishedAt?.toISOString() ?? null,
          lastPublishedAt: item.lastPublishedAt?.toISOString() ?? null,
          scheduledFor: item.scheduledFor?.toISOString() ?? null,
          workingRevisionId: item.workingRevisionId,
          publishedRevisionId: item.publishedRevisionId,
          hasPendingChanges:
            item.workingRevision !== null &&
            item.publishedRevision !== null &&
            item.workingRevision.bodyHash !== item.publishedRevision.bodyHash,
          path: item.path,
          tenant: item.tenant,
        }));

        span.attr("item_count", result.length);
        await spanPayload(span, "items_response", result);

        return NextResponse.json(result);
      },
    );
  });
}

export async function POST(req: NextRequest) {
  return withRouteTrace(req, { route: "/api/publishing/items" }, async () => {
    const session = await requireAuth();
    const body = (await req.json()) as {
      contentNodeId: string;
      pathId: string;
      slug: string;
      payloadType: string;
      publicTitle?: string;
      // Optional. If omitted, the item is created on the user's primary
      // tenant. Multi-tenant clients (Phase 6b CreatePublicItemDialog
      // picker) pass the chosen tenant explicitly.
      tenantId?: string;
    };
    const { contentNodeId, pathId, slug, payloadType, publicTitle, tenantId } = body;

    if (!contentNodeId || !pathId || !slug || !payloadType) {
      logger.warn({
        layer: "content",
        event: "publishing_item_create:rejected",
        summary: "missing required fields",
        attrs: { reason: "validation_error" },
      });
      return NextResponse.json(
        { error: "contentNodeId, pathId, slug, payloadType required" },
        { status: 400 },
      );
    }

    return withSpan(
      { layer: "content", name: "publishing:create" },
      {
        summary: "publishing item create",
        attrs: { content_node_id: contentNodeId, path_id: pathId, slug, payload_type: payloadType },
      },
      async (span) => {
        await spanPayload(span, "incoming_body", body);

        // Resolve destination tenant (explicit body.tenantId or user's primary).
        let destTenantId: string;
        try {
          destTenantId = await resolveWritableTenantId(session.user.id, tenantId);
        } catch (err) {
          if (err instanceof TenantAuthError) {
            logger.warn({
              layer: "content",
              event: "publishing_item_create:rejected",
              summary: err.message,
              attrs: { reason: err.code, requested_tenant_id: tenantId ?? "(primary)" },
            });
            return NextResponse.json({ error: err.message }, { status: err.status });
          }
          throw err;
        }

        // Verify the ContentNode belongs to this user
        const node = await prisma.contentNode.findFirst({
          where: { id: contentNodeId, ownerId: session.user.id },
        });
        if (!node) {
          logger.warn({
            layer: "content",
            event: "publishing_item_create:rejected",
            summary: "content node not found or not owned",
            attrs: { content_node_id: contentNodeId },
          });
          return NextResponse.json({ error: "ContentNode not found" }, { status: 404 });
        }

        const item = await prisma.publicItem.create({
          data: {
            ownerId: session.user.id,
            tenantId: destTenantId,
            contentNodeId,
            pathId,
            slug,
            payloadType: payloadType as never,
            publicTitle: publicTitle ?? null,
            state: "draft",
          },
        });

        // Create the type-specific payload record (all fields have defaults or are optional).
        // Non-fatal: payload creation failure doesn't block the item from being created.
        try {
          switch (payloadType) {
            case "blog_post":
              await prisma.blogPostPayload.create({ data: { publicItemId: item.id } });
              break;
            case "page":
              await prisma.pagePayload.create({ data: { publicItemId: item.id } });
              break;
            case "project":
              await prisma.projectPayload.create({ data: { publicItemId: item.id } });
              break;
            case "profile_section":
              await prisma.profileSectionPayload.create({ data: { publicItemId: item.id } });
              break;
            case "case_study":
              await prisma.caseStudyPayload.create({ data: { publicItemId: item.id } });
              break;
            case "media_item":
              await prisma.mediaItemPayload.create({ data: { publicItemId: item.id } });
              break;
            // bookmark requires a URL; caller must PATCH to add it
          }
        } catch (error) {
          logger.warn({
            layer: "content",
            event: "publishing_item_payload_create:caught",
            summary: "type-specific payload create failed (non-fatal)",
            attrs: { public_item_id: item.id, payload_type: payloadType },
            error,
          });
        }

        span.attr("public_item_id", item.id);
        await spanPayload(span, "created_item", item);

        // New item created as draft — listing on tenant's home doesn't
        // change until it's published, but we invalidate the tenant tag
        // anyway so the IDE's data fetches stay consistent.
        await invalidateTenantCache({ type: "tenant", tenantId: destTenantId });

        return NextResponse.json(item, { status: 201 });
      },
    );
  });
}
