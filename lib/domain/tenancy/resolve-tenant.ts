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

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/database/client";
import { logger } from "@/lib/core/logger/emit";
import { withSpan } from "@/lib/core/logger/span";
import { getActiveTrace, withTrace } from "@/lib/core/logger/context";
import type { ResolvedTenant } from "./types";

// Self-contained trace context guard. These helpers are called from three
// kinds of callsites:
//   1. API route handlers (already inside withRouteTrace)
//   2. The Next.js proxy (already inside its own withTrace)
//   3. Build-time prerender / scripts (no trace context exists yet)
// withSpan throws outside withTrace, so we ensure a context exists before
// any span work. Inside an existing trace this is a no-op (re-uses the
// parent context); standalone callers get a fresh trace_id.
export function ensureTraceContext<T>(fn: () => Promise<T>): Promise<T> {
  if (getActiveTrace()) return fn();
  return withTrace(randomUUID(), fn) as Promise<T>;
}

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

// If PLATFORM_DOMAIN is set (e.g. "digital-garden.com") and the request
// host looks like `<slug>.<PLATFORM_DOMAIN>`, return the slug. Used by
// the subdomain resolver path so every tenant is reachable at its own
// subdomain once wildcard DNS is configured for the platform domain.
// Returns null when no subdomain match (caller falls back to TenantHost
// exact match).
export function extractSubdomainSlug(host: string): string | null {
  const platformDomain = process.env.PLATFORM_DOMAIN?.trim().toLowerCase();
  if (!platformDomain) return null;
  // Don't match the platform domain itself (e.g. "digital-garden.com").
  if (host === platformDomain) return null;
  // Match `<something>.<platform>`. Conservative slug pattern (no
  // multi-segment subdomains, no leading hyphens, etc.) to avoid
  // false positives from typos like `www.platform.com`.
  const suffix = `.${platformDomain}`;
  if (!host.endsWith(suffix)) return null;
  const slug = host.slice(0, host.length - suffix.length);
  // Slug must be a single label, lowercase alphanumeric + hyphen,
  // 1–63 chars (DNS label limit).
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(slug)) return null;
  // Don't claim conventional non-tenant subdomains.
  if (slug === "www") return null;
  return slug;
}

export async function resolveTenantByHost(
  rawHost: string | null | undefined,
): Promise<ResolvedTenant | null> {
  const host = normalizeHost(rawHost);
  return ensureTraceContext(() => withSpan(
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
        // No exact host match. Try subdomain pattern:
        // if host looks like `<slug>.<PLATFORM_DOMAIN>`, look up
        // by slug. Enables every tenant to be reachable at its
        // own subdomain once wildcard DNS is configured.
        const subdomainSlug = extractSubdomainSlug(host);
        if (subdomainSlug) {
          const tenantBySlug = await prisma.tenant.findUnique({
            where: { slug: subdomainSlug },
            select: {
              id: true,
              ownerId: true,
              slug: true,
              displayName: true,
              isPersonal: true,
            },
          });
          if (tenantBySlug) {
            const resolved: ResolvedTenant = {
              tenantId: tenantBySlug.id,
              ownerId: tenantBySlug.ownerId,
              slug: tenantBySlug.slug,
              displayName: tenantBySlug.displayName,
              isPersonal: tenantBySlug.isPersonal,
              resolvedFromHost: host,
            };
            span.attrs({
              tenant_id: resolved.tenantId,
              slug: resolved.slug,
              source: "db_subdomain",
            });
            logger.info({
              layer: "route",
              event: "tenancy:host:resolved",
              attrs: {
                host,
                tenant_id: resolved.tenantId,
                slug: resolved.slug,
                source: "db_subdomain",
              },
            });
            return resolved;
          }
        }

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
  ));
}

// Look up a tenant by its id (e.g. from an x-tenant-id header injected by
// middleware). Cheaper than re-resolving from host on every page render.
export async function resolveTenantById(
  tenantId: string,
): Promise<ResolvedTenant | null> {
  return ensureTraceContext(() => withSpan(
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
  ));
}
