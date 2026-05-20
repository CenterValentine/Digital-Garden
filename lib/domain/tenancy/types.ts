// Tenancy module types. Plain TS — no Prisma client imports, safe to use
// from server components and route handlers without pulling the database
// surface into client bundles.
//
// See docs/notes-feature/work-tracking/epochs/epoch-18-multi-tenancy.md.

export type ResolvedTenant = {
  tenantId: string;
  ownerId: string;
  slug: string;
  displayName: string;
  isPersonal: boolean;
  // The hostname this tenant was resolved through. Useful for logging /
  // building canonical URLs. Undefined when the tenant was resolved via the
  // legacy SITE_OWNER_ID fallback (no host context).
  resolvedFromHost?: string;
};

export type TenantResolutionSource = "header" | "legacy_env" | "db" | "edge_config";

// What a middleware / page handler receives when asking "who is this request for?"
export type CurrentTenantContext = {
  tenant: ResolvedTenant;
  source: TenantResolutionSource;
};
