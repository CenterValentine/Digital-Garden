// Public API for the tenancy module. Server-only — these functions reach
// into the database and Next.js request headers.
//
// See docs/notes-feature/work-tracking/epochs/epoch-18-multi-tenancy.md
// for the epoch overview, and docs/notes-feature/work-tracking/MULTI-TENANCY-PLAN.md
// for the phase-by-phase plan.

export {
  resolveTenantByHost,
  resolveTenantById,
  normalizeHost,
} from "./resolve-tenant";
export { getCurrentTenant } from "./get-current-tenant";
export { resolveWritableTenantId, TenantAuthError } from "./api";
export {
  canClaimCustomHosts,
  CUSTOM_HOST_DENIED_MESSAGE,
} from "./permissions";
export type { PermissionUser } from "./permissions";
export { assertPlatformHost } from "./host-gate";
export { invalidateTenantCache } from "./cache";
export {
  createPersonalTenantForUser,
  slugFromUsername,
} from "./auto-create-tenant";
export type { ProvisionedTenant } from "./auto-create-tenant";
export {
  resolveTenantBySlug,
  resolvePublicItem,
  resolvePublicPath,
  buildPublicItemPath,
  buildSubpathItemUrl,
} from "./public-render";
export type {
  ResolvedTenant,
  TenantResolutionSource,
  CurrentTenantContext,
} from "./types";
