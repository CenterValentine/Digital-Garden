// Host → Tenant resolution. Server-only.
//
// Phase 1: DB-backed lookup. Phase 6 will front this with Vercel Edge Config
// for sub-ms reads, with DB as the fallback path.
//
// Observability: every resolution opens a span. The closed-set ServerLayer
// does not yet include "tenancy" — the governance update to add it is a
// separate charter PR (see epoch-18-multi-tenancy.md "Observability
// requirements"). Until then we tag these spans under "route" since
// host-routing is conceptually a routing concern.

import { prisma } from "@/lib/database/client";
import { logger } from "@/lib/core/logger/emit";
import { withSpan } from "@/lib/core/logger/span";
import type { ResolvedTenant } from "./types";

// Normalize a Host header value into a lookup key.
// Strips port (`example.com:3015` → `example.com`) and lowercases.
// Returns null for empty / obviously invalid hosts.
export function normalizeHost(rawHost: string | null | undefined): string | null {
  if (!rawHost) return null;
  const trimmed = rawHost.trim().toLowerCase();
  if (!trimmed) return null;
  // Strip port if present. IPv6 hosts wrap the host in [], but we don't
  // expect those here — the multi-tenant story is hostname-based.
  const portIdx = trimmed.indexOf(":");
  return portIdx === -1 ? trimmed : trimmed.slice(0, portIdx);
}

export async function resolveTenantByHost(
  rawHost: string | null | undefined,
): Promise<ResolvedTenant | null> {
  const host = normalizeHost(rawHost);
  return withSpan(
    { layer: "route", name: "tenancy:host:resolve" },
    { attrs: { host: host ?? "(none)" } },
    async (span) => {
      if (!host) {
        logger.warn({
          layer: "route",
          event: "tenancy:host:not_found",
          attrs: { reason: "empty_host" },
        });
        return null;
      }

      const row = await withSpan(
        { layer: "route", name: "tenancy:tenant:lookup" },
        { attrs: { host, source: "db" } },
        () =>
          prisma.tenantHost.findUnique({
            where: { host },
            include: { tenant: true },
          }),
      );

      if (!row) {
        logger.info({
          layer: "route",
          event: "tenancy:host:not_found",
          attrs: { host, source: "db" },
        });
        return null;
      }

      const resolved: ResolvedTenant = {
        tenantId: row.tenant.id,
        ownerId: row.tenant.ownerId,
        slug: row.tenant.slug,
        displayName: row.tenant.displayName,
        isPersonal: row.tenant.isPersonal,
        resolvedFromHost: host,
      };

      span.attrs({ tenant_id: resolved.tenantId, slug: resolved.slug });
      logger.info({
        layer: "route",
        event: "tenancy:host:resolved",
        attrs: { host, tenant_id: resolved.tenantId, slug: resolved.slug },
      });

      return resolved;
    },
  );
}

// Look up a tenant by its id (e.g. from an x-tenant-id header injected by
// middleware). Cheaper than re-resolving from host on every page render.
export async function resolveTenantById(
  tenantId: string,
): Promise<ResolvedTenant | null> {
  return withSpan(
    { layer: "route", name: "tenancy:tenant:lookup" },
    { attrs: { tenant_id: tenantId, source: "db" } },
    async () => {
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) return null;
      return {
        tenantId: tenant.id,
        ownerId: tenant.ownerId,
        slug: tenant.slug,
        displayName: tenant.displayName,
        isPersonal: tenant.isPersonal,
      };
    },
  );
}
