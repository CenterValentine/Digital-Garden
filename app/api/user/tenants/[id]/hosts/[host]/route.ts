/**
 * DELETE /api/user/tenants/[id]/hosts/[host]    — remove a custom hostname
 * POST   /api/user/tenants/[id]/hosts/[host]    — body { action: "verify" }
 *                                                 re-check verification with Vercel
 *
 * Both routes require ownership of the parent tenant.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { prisma } from "@/lib/database/client";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";
import {
  checkDomainReadiness,
  describeDnsRequirements,
  removeDomain,
  verifyDomain,
  VercelDomainsApiError,
  VercelDomainsUnavailableError,
} from "@/lib/infrastructure/vercel/domains";

const ROUTE_PATH = "/api/user/tenants/[id]/hosts/[host]";

async function loadAndAuthorize(
  userId: string,
  tenantId: string,
  host: string,
) {
  const decodedHost = decodeURIComponent(host).toLowerCase();
  const tenantHost = await prisma.tenantHost.findUnique({
    where: { host: decodedHost },
    include: { tenant: { select: { id: true, ownerId: true } } },
  });
  if (!tenantHost) return { error: 404 as const, decodedHost };
  if (tenantHost.tenantId !== tenantId) return { error: 404 as const, decodedHost };
  if (tenantHost.tenant.ownerId !== userId) return { error: 404 as const, decodedHost };
  return { tenantHost, decodedHost };
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; host: string }> },
) {
  return withRouteTrace(req, { route: ROUTE_PATH }, async () => {
    const session = await requireAuth();
    const { id, host } = await params;

    return withSpan(
      { layer: "auth", name: "user_tenant_host:remove" },
      { attrs: { tenant_id: id, host } },
      async () => {
        const result = await loadAndAuthorize(session.user.id, id, host);
        if ("error" in result) {
          return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        // Remove from Vercel first; if Vercel succeeds but DB fails,
        // a re-attempt will hit Vercel's 404 (idempotent in removeDomain).
        try {
          await removeDomain(result.decodedHost);
        } catch (err) {
          if (err instanceof VercelDomainsUnavailableError) {
            logger.warn({
              layer: "auth",
              event: "user_tenant_host_remove:vercel_unavailable",
              summary: "removed from DB only (Vercel API not configured)",
              attrs: { host: result.decodedHost },
            });
            // Continue with DB delete — at worst, an orphan stays
            // registered at Vercel that nothing in our system references.
          } else if (err instanceof VercelDomainsApiError) {
            // Surface non-fatal Vercel errors but still try to remove
            // from our DB (the user's intent is clear).
            logger.warn({
              layer: "auth",
              event: "user_tenant_host_remove:vercel_error",
              attrs: {
                host: result.decodedHost,
                vercel_status: err.status,
                vercel_code: err.code ?? "(none)",
              },
            });
          } else {
            throw err;
          }
        }

        await prisma.tenantHost.delete({
          where: { host: result.decodedHost },
        });

        return new NextResponse(null, { status: 204 });
      },
    );
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; host: string }> },
) {
  return withRouteTrace(req, { route: ROUTE_PATH }, async () => {
    const session = await requireAuth();
    const { id, host } = await params;
    const body = (await req.json().catch(() => ({}))) as { action?: string };

    if (body.action !== "verify") {
      return NextResponse.json(
        { error: "Unknown action. Use { action: 'verify' }." },
        { status: 400 },
      );
    }

    return withSpan(
      { layer: "auth", name: "user_tenant_host:verify" },
      { attrs: { tenant_id: id, host } },
      async (span) => {
        const result = await loadAndAuthorize(session.user.id, id, host);
        if ("error" in result) {
          return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        let vercelDomain;
        let isReady: boolean;
        try {
          // verifyDomain triggers Vercel to re-check ownership; we
          // additionally call checkDomainReadiness to confirm DNS is
          // ALSO routing correctly. Marking verifiedAt only when both
          // pass — see lib/infrastructure/vercel/domains.ts comment
          // for why `verified` alone is misleading.
          vercelDomain = await verifyDomain(result.decodedHost);
          const readiness = await checkDomainReadiness(result.decodedHost);
          isReady = readiness.isReady;
          vercelDomain = readiness.domain;
        } catch (err) {
          if (err instanceof VercelDomainsUnavailableError) {
            return NextResponse.json(
              { error: "Custom hostname feature is not configured." },
              { status: 503 },
            );
          }
          if (err instanceof VercelDomainsApiError) {
            return NextResponse.json(
              { error: `Vercel verification check failed: ${err.message}` },
              { status: 502 },
            );
          }
          throw err;
        }

        // Update our row. If Vercel confirmed verified, mark verifiedAt
        // and clear pending DNS instructions. If still pending, refresh
        // the DNS instructions (Vercel may have changed challenges).
        const dnsInstructions = describeDnsRequirements(vercelDomain);
        const updated = await prisma.tenantHost.update({
          where: { host: result.decodedHost },
          data: {
            verifiedAt: isReady ? new Date() : null,
            vercelConfigData: {
              verification: vercelDomain.verification,
              dnsInstructions,
            } as never,
          } as never,
        });

        span.attr("verified", vercelDomain.verified).attr("is_ready", isReady);

        return NextResponse.json({
          host: updated.host,
          verifiedAt:
            (updated as unknown as { verifiedAt: Date | null }).verifiedAt
              ?.toISOString() ?? null,
          vercelConfigData: {
            verification: vercelDomain.verification,
            dnsInstructions,
          },
        });
      },
    );
  });
}
