/**
 * GET  /api/user/tenants/[id]/hosts   — list custom hostnames for this tenant.
 * POST /api/user/tenants/[id]/hosts   — claim a new hostname.
 *
 * Custom hostname claiming flow:
 *   1. User submits a domain (e.g. mysite.com) for tenant X.
 *   2. We call Vercel Domains API to register it (returns DNS challenges).
 *   3. We create a TenantHost row with verifiedAt: null (pending).
 *   4. We return the DNS records the user needs to configure.
 *   5. User configures DNS at their registrar.
 *   6. User calls POST /hosts/<host>/verify (separate route) to re-check.
 *   7. When Vercel confirms verified, we set verifiedAt + the proxy
 *      starts routing the host to the tenant.
 *
 * Hosts with verifiedAt: null are excluded from public host resolution
 * (see resolve-tenant.ts filter — added in this phase).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { prisma } from "@/lib/database/client";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";
import {
  addDomain,
  checkDomainReadiness,
  describeDnsRequirements,
  VercelDomainsApiError,
  VercelDomainsUnavailableError,
  type VercelDomain,
} from "@/lib/infrastructure/vercel/domains";

const ROUTE_PATH = "/api/user/tenants/[id]/hosts";

// Conservative hostname validation. RFC 1035 says max 253 chars total,
// each label 1–63 chars, alphanumeric + hyphen, no leading/trailing hyphen.
const HOST_PATTERN =
  /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

async function requireOwnedTenant(userId: string, tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, ownerId: true, slug: true, displayName: true },
  });
  if (!tenant || tenant.ownerId !== userId) return null;
  return tenant;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withRouteTrace(req, { route: ROUTE_PATH }, async () => {
    const session = await requireAuth();
    const { id } = await params;

    return withSpan(
      { layer: "auth", name: "user_tenant_hosts:list" },
      { attrs: { tenant_id: id } },
      async () => {
        const tenant = await requireOwnedTenant(session.user.id, id);
        if (!tenant) {
          return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        const hosts = await prisma.tenantHost.findMany({
          where: { tenantId: id },
          orderBy: { createdAt: "asc" },
        });

        return NextResponse.json({
          hosts: hosts.map((h) => ({
            host: h.host,
            isPrimary: h.isPrimary,
            createdAt: h.createdAt.toISOString(),
            // verifiedAt + vercelConfigData added in the schema patch
            // that accompanies this phase. The fields are read with
            // optional access so the route still works if the schema
            // patch hasn't been applied yet.
            verifiedAt:
              (h as unknown as { verifiedAt: Date | null }).verifiedAt
                ?.toISOString() ?? null,
            vercelConfigData:
              (h as unknown as { vercelConfigData: unknown }).vercelConfigData ??
              null,
          })),
        });
      },
    );
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withRouteTrace(req, { route: ROUTE_PATH }, async () => {
    const session = await requireAuth();
    const { id } = await params;

    const body = (await req.json()) as { host?: string };
    const requestedHost = (body.host ?? "").trim().toLowerCase();

    if (!HOST_PATTERN.test(requestedHost)) {
      logger.warn({
        layer: "auth",
        event: "user_tenant_host_add:rejected",
        summary: "invalid hostname format",
        attrs: { reason: "validation_error", host: requestedHost },
      });
      return NextResponse.json(
        { error: "Invalid hostname. Use a fully-qualified domain like 'mysite.com'." },
        { status: 400 },
      );
    }

    return withSpan(
      { layer: "auth", name: "user_tenant_host:add" },
      { attrs: { tenant_id: id, host: requestedHost } },
      async (span) => {
        const tenant = await requireOwnedTenant(session.user.id, id);
        if (!tenant) {
          return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        // Reject if already claimed (by any tenant).
        const existing = await prisma.tenantHost.findUnique({
          where: { host: requestedHost },
          select: { tenantId: true },
        });
        if (existing) {
          if (existing.tenantId === id) {
            return NextResponse.json(
              { error: "This site already has that hostname." },
              { status: 409 },
            );
          }
          return NextResponse.json(
            { error: "That hostname is already in use." },
            { status: 409 },
          );
        }

        // Register with Vercel — returns DNS verification details.
        // Then call checkDomainReadiness which combines the ownership
        // check (`verified`) with the DNS config check (`misconfigured`).
        // Only when BOTH pass is the domain actually routable; using
        // just `verified` would mislead users since Vercel marks
        // newly-added domains as `verified: true` immediately (you
        // "verifiably" own it in your account) even before DNS resolves.
        let vercelDomain: VercelDomain;
        let isReady: boolean;
        try {
          vercelDomain = await addDomain(requestedHost);
          const readiness = await checkDomainReadiness(requestedHost);
          isReady = readiness.isReady;
          vercelDomain = readiness.domain; // refresh with latest state
        } catch (err) {
          if (err instanceof VercelDomainsUnavailableError) {
            return NextResponse.json(
              {
                error:
                  "Custom hostname feature is not configured in this environment. Contact admin.",
              },
              { status: 503 },
            );
          }
          if (err instanceof VercelDomainsApiError) {
            logger.warn({
              layer: "auth",
              event: "user_tenant_host_add:vercel_error",
              attrs: { host: requestedHost, vercel_status: err.status, vercel_code: err.code ?? "(none)" },
            });
            return NextResponse.json(
              { error: `Vercel rejected the domain: ${err.message}` },
              { status: 502 },
            );
          }
          throw err;
        }

        // Create the TenantHost as pending. The proxy filters by
        // verifiedAt: { not: null } so pending hosts don't route yet.
        // The `as never` casts here are because the schema patch (adding
        // verifiedAt + vercelConfigData) is applied separately by the
        // user; we write the runtime code assuming the fields exist so
        // it works as soon as the patch lands.
        const dnsInstructions = describeDnsRequirements(vercelDomain);
        const tenantHost = await prisma.tenantHost.create({
          data: {
            host: requestedHost,
            tenantId: id,
            isPrimary: false,
            verifiedAt: isReady ? new Date() : null,
            vercelConfigData: {
              verification: vercelDomain.verification,
              dnsInstructions,
            } as never,
          } as never,
        });

        span.attr("verified", vercelDomain.verified).attr("is_ready", isReady);

        return NextResponse.json(
          {
            host: tenantHost.host,
            isPrimary: false,
            verifiedAt:
              (tenantHost as unknown as { verifiedAt: Date | null }).verifiedAt
                ?.toISOString() ?? null,
            vercelConfigData: {
              verification: vercelDomain.verification,
              dnsInstructions,
            },
          },
          { status: 201 },
        );
      },
    );
  });
}
