/**
 * GET  /api/publishing/paths  — list PublicPath tree for the authenticated owner
 * POST /api/publishing/paths  — create a new PublicPath
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { prisma } from "@/lib/database/client";
import { logger } from "@/lib/core/logger";
import { withRouteTrace } from "@/lib/core/logger/route-trace";
import { withSpan } from "@/lib/core/logger/span";
import { spanPayload } from "@/lib/core/logger/span-payload";
import { resolveWritableTenantId, TenantAuthError } from "@/lib/domain/tenancy/api";
import { invalidateTenantCache } from "@/lib/domain/tenancy/cache";

export async function GET(req: NextRequest) {
  return withRouteTrace(req, { route: "/api/publishing/paths" }, async () => {
    const session = await requireAuth();

    return withSpan(
      { layer: "content", name: "publishing:paths_list" },
      { summary: "publishing paths list" },
      async (span) => {
        // Return paths across all tenants the user owns. Phase 6c (Settings
        // Sites UI) can add a tenantId query param to narrow this; today's
        // single-tenant users see no behavior change.
        const paths = await prisma.publicPath.findMany({
          where: { tenant: { ownerId: session.user.id } },
          orderBy: [{ parentId: "asc" }, { displayOrder: "asc" }],
          include: {
            _count: { select: { items: { where: { deletedAt: null } } } },
            tenant: { select: { id: true, slug: true } },
          },
        });

        // Build tree client-side via parentId references
        interface PathNode {
          id: string;
          parentId: string | null;
          slug: string;
          title: string;
          description: string | null;
          displayOrder: number;
          icon: string | null;
          children: PathNode[];
          itemCount: number;
          tenantId: string | null;
          tenantSlug: string | null;
        }

        const nodeMap = new Map<string, PathNode>();
        const roots: PathNode[] = [];

        for (const p of paths) {
          const node: PathNode = {
            id: p.id,
            parentId: p.parentId,
            slug: p.slug,
            title: p.title,
            description: p.description,
            displayOrder: p.displayOrder,
            icon: p.icon,
            children: [],
            itemCount: p._count.items,
            tenantId: p.tenant?.id ?? null,
            tenantSlug: p.tenant?.slug ?? null,
          };
          nodeMap.set(p.id, node);
        }

        for (const node of nodeMap.values()) {
          if (node.parentId && nodeMap.has(node.parentId)) {
            nodeMap.get(node.parentId)!.children.push(node);
          } else {
            roots.push(node);
          }
        }

        span.attr("path_count", paths.length).attr("root_count", roots.length);
        await spanPayload(span, "paths_response", roots);

        return NextResponse.json(roots);
      },
    );
  });
}

export async function POST(req: NextRequest) {
  return withRouteTrace(req, { route: "/api/publishing/paths" }, async () => {
    const session = await requireAuth();
    const body = (await req.json()) as {
      slug: string;
      title: string;
      parentId?: string;
      description?: string;
      icon?: string;
      // Optional. Defaults to user's primary tenant when omitted.
      tenantId?: string;
    };
    const { slug, title, parentId, description, icon, tenantId } = body;

    if (!slug || !title) {
      logger.warn({
        layer: "content",
        event: "publishing_path_create:rejected",
        summary: "slug and title required",
        attrs: { reason: "validation_error" },
      });
      return NextResponse.json({ error: "slug and title required" }, { status: 400 });
    }

    return withSpan(
      { layer: "content", name: "publishing:path_create" },
      { summary: "publishing path create", attrs: { slug, parent_id: parentId ?? "root" } },
      async (span) => {
        await spanPayload(span, "incoming_body", body);

        let destTenantId: string;
        try {
          destTenantId = await resolveWritableTenantId(session.user.id, tenantId);
        } catch (err) {
          if (err instanceof TenantAuthError) {
            logger.warn({
              layer: "content",
              event: "publishing_path_create:rejected",
              summary: err.message,
              attrs: { reason: err.code, requested_tenant_id: tenantId ?? "(primary)" },
            });
            return NextResponse.json({ error: err.message }, { status: err.status });
          }
          throw err;
        }

        const path = await prisma.publicPath.create({
          data: {
            ownerId: session.user.id,
            tenantId: destTenantId,
            slug,
            title,
            parentId: parentId ?? null,
            description: description ?? null,
            icon: icon ?? null,
          },
        });

        span.attr("path_id", path.id);

        // New path appears in the tenant's listings (even if empty).
        await invalidateTenantCache({ type: "tenant", tenantId: destTenantId });

        return NextResponse.json(path, { status: 201 });
      },
    );
  });
}
