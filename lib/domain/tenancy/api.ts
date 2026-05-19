// Helpers used by /api/publishing/* route handlers to resolve which
// tenant a write should target.
//
// Pattern: the body may include an optional `tenantId`. When present,
// validate the session user owns that tenant. When absent, fall back to
// the user's `primaryTenantId`. Either way, return the canonical
// tenantId for use in the create/update payload.

import { prisma } from "@/lib/database/client";

export class TenantAuthError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404,
    readonly code: "no_primary_tenant" | "tenant_not_owned" | "tenant_not_found",
  ) {
    super(message);
    this.name = "TenantAuthError";
  }
}

/**
 * Resolve the tenantId for a write operation by the session user.
 *
 * - If `requestedTenantId` is provided, verify the user owns that tenant
 *   and return its id.
 * - Otherwise return the user's `primaryTenantId`.
 *
 * Throws `TenantAuthError` on validation failures so route handlers can
 * convert to NextResponse without polluting business logic with error
 * shapes. Callers should catch and convert.
 */
export async function resolveWritableTenantId(
  userId: string,
  requestedTenantId?: string | null,
): Promise<string> {
  if (requestedTenantId) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: requestedTenantId },
      select: { id: true, ownerId: true },
    });
    if (!tenant) {
      throw new TenantAuthError(
        "Tenant not found",
        404,
        "tenant_not_found",
      );
    }
    if (tenant.ownerId !== userId) {
      throw new TenantAuthError(
        "Tenant not owned by this user",
        403,
        "tenant_not_owned",
      );
    }
    return tenant.id;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { primaryTenantId: true },
  });
  if (!user?.primaryTenantId) {
    throw new TenantAuthError(
      "User has no primary tenant set — run backfill",
      400,
      "no_primary_tenant",
    );
  }
  return user.primaryTenantId;
}
