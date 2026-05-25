/**
 * PATCH /api/user/tenants/[id]  — rename, change slug, or set as primary.
 *
 * Body shape (all fields optional, any combination):
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
