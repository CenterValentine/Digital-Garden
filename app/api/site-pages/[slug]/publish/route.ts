/**
 * POST /api/site-pages/[slug]/publish — promote pending composer edits.
 *
 * Copies draftConfig → config, clears draftConfig, and revalidates the page's
 * public route so the live site reflects the change immediately (the public
 * catch-all is ISR'd at 60s otherwise). No-op (200, published:false) when
 * there is no pending draft.
 *
 * Owner-only, same tenant resolution as the sibling route: caller's primary
 * tenant unless an owned `tenantId` is supplied in the body.
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { prisma } from "@/lib/database/client";
import { Prisma } from "@/lib/database/generated/prisma";
import { withRouteTrace } from "@/lib/core/logger";
import { resolveWritableTenantId, TenantAuthError } from "@/lib/domain/tenancy";

const ROUTE_PATH = "/api/site-pages/[slug]/publish";

type Ctx = { params: Promise<{ slug: string }> };

/** Personal-site "home" uses an empty slug; the route segment carries "home". */
function normalizeSlug(routeSlug: string): string {
  return routeSlug === "home" ? "" : routeSlug;
}

export async function POST(req: NextRequest, { params }: Ctx) {
  return withRouteTrace(req, { route: ROUTE_PATH }, async () => {
    const slug = normalizeSlug((await params).slug);
    const body = (await req.json().catch(() => null)) as
      | { tenantId?: string | null }
      | null;

    try {
      const session = await requireAuth();
      const tenantId = await resolveWritableTenantId(session.user.id, body?.tenantId);

      const page = await prisma.sitePage.findUnique({
        where: { tenantId_slug: { tenantId, slug } },
        select: { draftConfig: true },
      });
      if (!page) {
        return NextResponse.json({ error: "Page not found" }, { status: 404 });
      }
      if (page.draftConfig === null) {
        return NextResponse.json({ published: false, reason: "no_pending_draft" });
      }

      const updated = await prisma.sitePage.update({
        where: { tenantId_slug: { tenantId, slug } },
        data: {
          config: page.draftConfig as unknown as Prisma.InputJsonValue,
          draftConfig: Prisma.DbNull,
        },
      });

      // Bust the ISR cache for the public route so publish is immediate.
      revalidatePath(slug === "" ? "/" : `/${slug}`);

      return NextResponse.json({ published: true, page: updated });
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
