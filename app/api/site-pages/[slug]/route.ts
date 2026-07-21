/**
 * GET    /api/site-pages/[slug]  — read one SitePage (row + config + draft), owner-only.
 * PUT    /api/site-pages/[slug]  — upsert; config is saved as a DRAFT
 *                                  (draftConfig). Metadata columns (title, kind,
 *                                  nav, visibility) apply immediately. The live
 *                                  page keeps serving `config` until publish.
 * DELETE /api/site-pages/[slug]  — remove a SitePage.
 *
 * Publishing (draftConfig → config) lives at POST /api/site-pages/[slug]/publish.
 * Backs the Settings → Site Pages composer + JSON escape hatch. Tenant is the
 * caller's primary unless a `tenantId` they own is supplied (query for
 * GET/DELETE, body for PUT).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { prisma } from "@/lib/database/client";
import type { Prisma } from "@/lib/database/generated/prisma";
import { withRouteTrace } from "@/lib/core/logger";
import { resolveWritableTenantId, TenantAuthError } from "@/lib/domain/tenancy";
import { sitePageInput } from "@/lib/domain/page-layout/schema";

const ROUTE_PATH = "/api/site-pages/[slug]";

type Ctx = { params: Promise<{ slug: string }> };

/** Personal-site "home" uses an empty slug; the route segment carries "home". */
function normalizeSlug(routeSlug: string): string {
  return routeSlug === "home" ? "" : routeSlug;
}

function authError(err: unknown): NextResponse | null {
  if (err instanceof Error && err.message === "Authentication required") {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (err instanceof TenantAuthError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  return null;
}

export async function GET(req: NextRequest, { params }: Ctx) {
  return withRouteTrace(req, { route: ROUTE_PATH }, async () => {
    const slug = normalizeSlug((await params).slug);
    const requestedTenantId = req.nextUrl.searchParams.get("tenantId");
    try {
      const session = await requireAuth();
      const tenantId = await resolveWritableTenantId(session.user.id, requestedTenantId);
      const page = await prisma.sitePage.findUnique({
        where: { tenantId_slug: { tenantId, slug } },
      });
      return NextResponse.json({ tenantId, page });
    } catch (err) {
      const resp = authError(err);
      if (resp) return resp;
      throw err;
    }
  });
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  return withRouteTrace(req, { route: ROUTE_PATH }, async () => {
    const slug = normalizeSlug((await params).slug);

    try {
      // Authenticate before parsing/validating the body.
      const session = await requireAuth();

      const body = (await req.json().catch(() => null)) as
        | (Record<string, unknown> & { tenantId?: string | null })
        | null;
      if (!body) {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
      }

      const parsed = sitePageInput.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Validation failed", issues: parsed.error.issues },
          { status: 422 },
        );
      }
      const input = parsed.data;

      const tenantId = await resolveWritableTenantId(session.user.id, body.tenantId);
      // Config edits land in draftConfig; the live `config` only changes via
      // the /publish endpoint. On first create there is no published config
      // yet, so the draft seeds both draftConfig and (empty) config.
      const draft = input.config as unknown as Prisma.InputJsonValue;
      const page = await prisma.sitePage.upsert({
        where: { tenantId_slug: { tenantId, slug } },
        create: {
          tenantId,
          slug,
          title: input.title,
          kind: input.kind,
          navLabel: input.navLabel ?? null,
          navOrder: input.navOrder,
          visibility: input.visibility,
          draftConfig: draft,
        },
        update: {
          title: input.title,
          kind: input.kind,
          navLabel: input.navLabel ?? null,
          navOrder: input.navOrder,
          visibility: input.visibility,
          draftConfig: draft,
        },
      });
      return NextResponse.json({ page });
    } catch (err) {
      const resp = authError(err);
      if (resp) return resp;
      throw err;
    }
  });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  return withRouteTrace(req, { route: ROUTE_PATH }, async () => {
    const slug = normalizeSlug((await params).slug);
    const requestedTenantId = req.nextUrl.searchParams.get("tenantId");
    try {
      const session = await requireAuth();
      const tenantId = await resolveWritableTenantId(session.user.id, requestedTenantId);
      await prisma.sitePage.deleteMany({ where: { tenantId, slug } });
      return NextResponse.json({ ok: true });
    } catch (err) {
      const resp = authError(err);
      if (resp) return resp;
      throw err;
    }
  });
}
