/**
 * PATCH  /api/user/tenants/[id]  — rename, change slug, or set as primary.
 * DELETE /api/user/tenants/[id]  — delete a site (blocked if it has any
 *                                  published items, paths, or hosts).
 *
 * Body shape for PATCH (all fields optional, any combination):
 *   { displayName?: string }    rename
 *   { slug?: string }           change slug (uniqueness checked)
 *   { asPrimary?: true }        set this tenant as the user's primary
 *
 * Auth: must own the tenant (Tenant.ownerId === session.user.id).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { prisma } from "@/lib/database/client";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";
import { isReservedSlug, RESERVED_SLUG_MESSAGE } from "@/lib/domain/tenancy";

const ROUTE_PATH = "/api/user/tenants/[id]";
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,118}[a-z0-9]$|^[a-z0-9]$/;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withRouteTrace(req, { route: ROUTE_PATH }, async () => {
    const session = await requireAuth();
    const { id } = await params;

    const body = (await req.json()) as {
      displayName?: string;
      slug?: string;
      asPrimary?: boolean;
    };

    return withSpan(
      { layer: "auth", name: "user_tenant:update" },
      { attrs: { tenant_id: id } },
      async (span) => {
        // Ownership check up-front.
        const tenant = await prisma.tenant.findUnique({
          where: { id },
          select: { id: true, ownerId: true, slug: true, displayName: true },
        });
        if (!tenant || tenant.ownerId !== session.user.id) {
          logger.warn({
            layer: "auth",
            event: "user_tenant_update:rejected",
            summary: "tenant not found or not owned",
            attrs: { tenant_id: id },
          });
          return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        const data: { displayName?: string; slug?: string } = {};

        if (body.displayName !== undefined) {
          const trimmed = body.displayName.trim();
          if (!trimmed) {
            return NextResponse.json(
              { error: "displayName cannot be empty" },
              { status: 400 },
            );
          }
          data.displayName = trimmed;
        }

        if (body.slug !== undefined) {
          const newSlug = body.slug.trim().toLowerCase();
          if (!SLUG_PATTERN.test(newSlug)) {
            return NextResponse.json(
              {
                error:
                  "Slug must be lowercase alphanumeric and hyphens, 1–120 chars, no leading/trailing hyphen.",
              },
              { status: 400 },
            );
          }
          // Block rename-into-reserved (mirrors creation gate). Existing
          // tenants whose current slug happens to BE reserved are not
          // forced to rename — see reserved-slugs.ts module doc.
          if (newSlug !== tenant.slug && isReservedSlug(newSlug)) {
            logger.warn({
              layer: "auth",
              event: "user_tenant_update:rejected",
              summary: "reserved slug",
              attrs: { tenant_id: id, reason: "reserved_slug", slug: newSlug },
            });
            return NextResponse.json(
              { error: RESERVED_SLUG_MESSAGE },
              { status: 400 },
            );
          }
          if (newSlug !== tenant.slug) {
            const conflict = await prisma.tenant.findUnique({
              where: { slug: newSlug },
              select: { id: true },
            });
            if (conflict) {
              return NextResponse.json(
                { error: "That slug is already taken" },
                { status: 409 },
              );
            }
            data.slug = newSlug;
          }
        }

        // Apply name/slug update first, then primary toggle.
        // Both can happen in one request.
        let updated = tenant;
        if (Object.keys(data).length > 0) {
          updated = await prisma.tenant.update({
            where: { id },
            data,
            select: { id: true, ownerId: true, slug: true, displayName: true },
          });
        }

        if (body.asPrimary === true) {
          await prisma.user.update({
            where: { id: session.user.id },
            data: { primaryTenantId: id },
          });
          span.attr("set_as_primary", true);
        }

        span.attr("slug", updated.slug).attr("name", updated.displayName);

        return NextResponse.json({
          id: updated.id,
          slug: updated.slug,
          displayName: updated.displayName,
        });
      },
    );
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withRouteTrace(req, { route: ROUTE_PATH }, async () => {
    const session = await requireAuth();
    const { id } = await params;

    return withSpan(
      { layer: "auth", name: "user_tenant:delete" },
      { attrs: { tenant_id: id } },
      async (span) => {
        // Ownership + existence check, also fetch the dependency counts
        // we need for the safety gates in a single round-trip.
        const tenant = await prisma.tenant.findUnique({
          where: { id },
          select: {
            id: true,
            ownerId: true,
            slug: true,
            _count: {
              select: {
                publicItems: { where: { deletedAt: null } },
                publicPaths: true,
                hosts: true,
              },
            },
          },
        });
        if (!tenant || tenant.ownerId !== session.user.id) {
          logger.warn({
            layer: "auth",
            event: "user_tenant_delete:rejected",
            summary: "tenant not found or not owned",
            attrs: { tenant_id: id },
          });
          return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        // Block deletion of the user's primary tenant. They must pick a
        // different primary first (avoids the "user has zero primary"
        // state which getCurrentTenant's legacy fallback can't handle).
        const user = await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { primaryTenantId: true },
        });
        if (user?.primaryTenantId === id) {
          return NextResponse.json(
            {
              error:
                "Cannot delete your primary site. Set a different site as primary first.",
            },
            { status: 409 },
          );
        }

        // Safety gates: block if anything still references this tenant.
        // The user should explicitly clean up first — no surprise cascades.
        if (tenant._count.publicItems > 0) {
          return NextResponse.json(
            {
              error: `Cannot delete: this site has ${tenant._count.publicItems} published item${tenant._count.publicItems === 1 ? "" : "s"}. Unpublish or archive them first.`,
            },
            { status: 409 },
          );
        }
        if (tenant._count.publicPaths > 0) {
          return NextResponse.json(
            {
              error: `Cannot delete: this site has ${tenant._count.publicPaths} path${tenant._count.publicPaths === 1 ? "" : "s"}. Delete them first.`,
            },
            { status: 409 },
          );
        }
        if (tenant._count.hosts > 0) {
          return NextResponse.json(
            {
              error: `Cannot delete: this site has ${tenant._count.hosts} custom hostname${tenant._count.hosts === 1 ? "" : "s"} attached. Remove them first.`,
            },
            { status: 409 },
          );
        }

        await prisma.tenant.delete({ where: { id } });
        span.attr("deleted_slug", tenant.slug);

        return new NextResponse(null, { status: 204 });
      },
    );
  });
}
