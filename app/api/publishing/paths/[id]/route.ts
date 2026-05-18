/**
 * PATCH  /api/publishing/paths/[id]  — update title, slug, description, icon
 * DELETE /api/publishing/paths/[id]  — delete (rejects if path has items or children)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { prisma } from "@/lib/database/client";
import { logger } from "@/lib/core/logger";
import { withRouteTrace } from "@/lib/core/logger/route-trace";
import { withSpan } from "@/lib/core/logger/span";
import { spanPayload } from "@/lib/core/logger/span-payload";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  return withRouteTrace(req, { route: "/api/publishing/paths/[id]" }, async () => {
    const session = await requireAuth();
    const { id } = await params;

    return withSpan(
      { layer: "content", name: "publishing:path_update" },
      { summary: "publishing path update", attrs: { path_id: id } },
      async (span) => {
        const path = await prisma.publicPath.findUnique({ where: { id } });
        if (!path || path.ownerId !== session.user.id) {
          logger.warn({
            layer: "content",
            event: "publishing_path_update:rejected",
            summary: "path not found or not owned",
            attrs: { path_id: id },
          });
          return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        const body = (await req.json()) as {
          title?: string;
          slug?: string;
          description?: string | null;
          icon?: string | null;
        };
        await spanPayload(span, "incoming_body", body);

        const updated = await prisma.publicPath.update({
          where: { id },
          data: {
            ...(body.title !== undefined && { title: body.title }),
            ...(body.slug !== undefined && { slug: body.slug }),
            ...(body.description !== undefined && { description: body.description }),
            ...(body.icon !== undefined && { icon: body.icon }),
          },
        });

        return NextResponse.json(updated);
      },
    );
  });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  return withRouteTrace(req, { route: "/api/publishing/paths/[id]" }, async () => {
    const session = await requireAuth();
    const { id } = await params;

    return withSpan(
      { layer: "content", name: "publishing:path_delete" },
      { summary: "publishing path delete", attrs: { path_id: id } },
      async (span) => {
        const path = await prisma.publicPath.findUnique({
          where: { id },
          include: {
            _count: {
              select: {
                children: true,
                items: { where: { deletedAt: null } },
              },
            },
          },
        });

        if (!path || path.ownerId !== session.user.id) {
          logger.warn({
            layer: "content",
            event: "publishing_path_delete:rejected",
            summary: "path not found or not owned",
            attrs: { path_id: id },
          });
          return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        if (path._count.children > 0) {
          logger.warn({
            layer: "content",
            event: "publishing_path_delete:rejected",
            summary: "path has child paths",
            attrs: { path_id: id, child_count: path._count.children },
          });
          return NextResponse.json(
            {
              error: `Cannot delete: this path has ${path._count.children} child path${path._count.children === 1 ? "" : "s"}. Delete them first.`,
            },
            { status: 409 },
          );
        }
        if (path._count.items > 0) {
          logger.warn({
            layer: "content",
            event: "publishing_path_delete:rejected",
            summary: "path contains published items",
            attrs: { path_id: id, item_count: path._count.items },
          });
          return NextResponse.json(
            {
              error: `Cannot delete: this path contains ${path._count.items} published item${path._count.items === 1 ? "" : "s"}. Remove them first.`,
            },
            { status: 409 },
          );
        }

        await prisma.publicPath.delete({ where: { id } });
        span.attr("deleted_slug", path.slug);
        return new NextResponse(null, { status: 204 });
      },
    );
  });
}
