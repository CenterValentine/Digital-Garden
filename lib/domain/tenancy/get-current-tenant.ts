// Server-only helper that resolves the current request's tenant.
//
// Phase 1: not wired into any page yet. Defined now so Phase 3 can swap
// SITE_OWNER_ID reads in app/page.tsx and app/(public)/[...path]/page.tsx
// for a single call to this function.
//
// Behavior contract:
//   - When MULTITENANT_ENABLED=true AND the request carries an x-tenant-id
//     header (injected by middleware in Phase 2), look up by that id.
//   - Otherwise fall back to the legacy single-tenant path: look up the
//     User identified by SITE_OWNER_ID env var and return their primary
//     tenant. Preserves current behavior with the flag off.
//   - Returns null if no tenant can be resolved. Callers decide whether
//     to 404 or render an empty state.

import { headers } from "next/headers";
import { prisma } from "@/lib/database/client";
import { logger } from "@/lib/core/logger/emit";
import { withSpan } from "@/lib/core/logger/span";
import { ensureTraceContext, resolveTenantById } from "./resolve-tenant";
import type { CurrentTenantContext } from "./types";

const SITE_OWNER_ID = process.env.SITE_OWNER_ID ?? "";
const MULTITENANT_ENABLED = process.env.MULTITENANT_ENABLED === "true";

export async function getCurrentTenant(): Promise<CurrentTenantContext | null> {
  return ensureTraceContext(() => withSpan(
    { layer: "route", name: "tenancy:current:resolve" },
    { attrs: { flag_enabled: MULTITENANT_ENABLED } },
    async () => {
      if (MULTITENANT_ENABLED) {
        const headerList = await headers();
        const tenantId = headerList.get("x-tenant-id");
        if (tenantId) {
          const tenant = await resolveTenantById(tenantId);
          if (tenant) {
            return { tenant, source: "header" as const };
          }
          logger.warn({
            layer: "route",
            event: "tenancy:current:header_unresolved",
            summary: "x-tenant-id header was set but tenant not found",
            attrs: { tenant_id: tenantId },
          });
        }
      }

      // Legacy fallback path. Preserves single-tenant behavior when the flag
      // is off, or when the header is missing (e.g., during the rollout
      // window before middleware ships).
      if (!SITE_OWNER_ID) {
        logger.warn({
          layer: "route",
          event: "tenancy:current:no_fallback",
          summary: "MULTITENANT_ENABLED off and SITE_OWNER_ID env missing",
        });
        return null;
      }

      const user = await prisma.user.findUnique({
        where: { id: SITE_OWNER_ID },
        include: { primaryTenant: true },
      });

      if (!user?.primaryTenant) {
        logger.warn({
          layer: "route",
          event: "tenancy:current:legacy_no_primary",
          summary:
            "SITE_OWNER_ID user has no primaryTenantId set — run backfill",
          attrs: { user_id: SITE_OWNER_ID, user_found: Boolean(user) },
        });
        return null;
      }

      return {
        tenant: {
          tenantId: user.primaryTenant.id,
          ownerId: user.primaryTenant.ownerId,
          slug: user.primaryTenant.slug,
          displayName: user.primaryTenant.displayName,
          isPersonal: user.primaryTenant.isPersonal,
        },
        source: "legacy_env" as const,
      };
    },
  ));
}
