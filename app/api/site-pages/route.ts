/**
 * GET /api/site-pages  — list the SitePages for a tenant (owner-only).
 *
 * Backs the Settings → Site Pages admin. Tenant is the caller's primary unless
 * a `?tenantId=` they own is supplied (validated by resolveWritableTenantId).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { prisma } from "@/lib/database/client";
import { withRouteTrace } from "@/lib/core/logger";
import { resolveWritableTenantId, TenantAuthError } from "@/lib/domain/tenancy";

const ROUTE_PATH = "/api/site-pages";

export async function GET(req: NextRequest) {
  return withRouteTrace(req, { route: ROUTE_PATH }, async () => {
    const requestedTenantId = req.nextUrl.searchParams.get("tenantId");

    try {
      const session = await requireAuth();
      const tenantId = await resolveWritableTenantId(session.user.id, requestedTenantId);
      const pages = await prisma.sitePage.findMany({
        where: { tenantId },
        select: {
          slug: true,
          title: true,
          kind: true,
          navLabel: true,
          navOrder: true,
          visibility: true,
          updatedAt: true,
        },
        orderBy: [{ navOrder: "asc" }, { slug: "asc" }],
      });
      return NextResponse.json({ tenantId, pages });
    } catch (err) {
      if (err instanceof Error && err.message === "Authentication required") {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      }
      if (err instanceof TenantAuthError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }
  });
}
