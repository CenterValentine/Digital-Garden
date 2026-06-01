/**
 * GET  /api/user/tenants  — list the session user's owned tenants.
 * POST /api/user/tenants  — create a new tenant for the session user.
 *
 * Backs the Settings → Sites page. Per Epoch 20 V1 scope:
 *   - No host claiming (TenantHost CRUD is a future epoch)
 *   - No deletion
 *   - No theming / branding fields
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { prisma } from "@/lib/database/client";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";
import { slugFromUsername } from "@/lib/domain/tenancy";

const ROUTE_PATH = "/api/user/tenants";

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,118}[a-z0-9]$|^[a-z0-9]$/;

export async function GET(req: NextRequest) {
  return withRouteTrace(req, { route: ROUTE_PATH }, async () => {
    const session = await requireAuth();

    return withSpan(
      { layer: "auth", name: "user_tenants:list" },
      undefined,
      async (span) => {
        const [tenants, user] = await Promise.all([
          prisma.tenant.findMany({
            where: { ownerId: session.user.id },
            select: {
              id: true,
              slug: true,
              displayName: true,
              isPersonal: true,
              createdAt: true,
            },
            orderBy: { createdAt: "asc" },
          }),
          prisma.user.findUnique({
            where: { id: session.user.id },
            select: { primaryTenantId: true },
          }),
        ]);

        span.attr("tenant_count", tenants.length);

        return NextResponse.json({
          tenants,
          primaryTenantId: user?.primaryTenantId ?? null,
          // Phase 13: the UI uses this to show "your sites are reachable at
          // <slug>.<platformDomain>" affordances. Null when the env var
          // isn't set (legacy single-tenant deployments). The bare value
          // is non-secret — same info as the public host.
          platformDomain:
            process.env.PLATFORM_DOMAIN?.trim().toLowerCase() ?? null,
        });
      },
    );
  });
}

export async function POST(req: NextRequest) {
  return withRouteTrace(req, { route: ROUTE_PATH }, async () => {
    const session = await requireAuth();

    const body = (await req.json()) as {
      slug?: string;
      displayName?: string;
    };
    const requestedSlug = (body.slug ?? "").trim().toLowerCase();
    const displayName = (body.displayName ?? "").trim();

    if (!displayName) {
      logger.warn({
        layer: "auth",
        event: "user_tenant_create:rejected",
        summary: "displayName missing",
        attrs: { reason: "validation_error" },
      });
      return NextResponse.json(
        { error: "displayName is required" },
        { status: 400 },
      );
    }

    // Derive slug from displayName if caller didn't provide one.
    const baseSlug = requestedSlug || slugFromUsername(displayName);
    if (!SLUG_PATTERN.test(baseSlug)) {
      logger.warn({
        layer: "auth",
        event: "user_tenant_create:rejected",
        summary: "invalid slug format",
        attrs: { reason: "validation_error", slug: baseSlug },
      });
      return NextResponse.json(
        {
          error:
            "Slug must be lowercase alphanumeric and hyphens, 1–120 chars, no leading/trailing hyphen.",
        },
        { status: 400 },
      );
    }

    return withSpan(
      { layer: "auth", name: "user_tenant:create" },
      { attrs: { slug: baseSlug } },
      async (span) => {
        // Reject if slug already taken (global unique constraint).
        const existing = await prisma.tenant.findUnique({
          where: { slug: baseSlug },
          select: { id: true },
        });
        if (existing) {
          logger.warn({
            layer: "auth",
            event: "user_tenant_create:rejected",
            summary: "slug already taken",
            attrs: { reason: "slug_conflict", slug: baseSlug },
          });
          return NextResponse.json(
            { error: "That slug is already taken" },
            { status: 409 },
          );
        }

        const tenant = await prisma.tenant.create({
          data: {
            ownerId: session.user.id,
            slug: baseSlug,
            displayName,
            isPersonal: false,
          },
          select: {
            id: true,
            slug: true,
            displayName: true,
            isPersonal: true,
            createdAt: true,
          },
        });

        span.attr("tenant_id", tenant.id);

        return NextResponse.json(tenant, { status: 201 });
      },
    );
  });
}
