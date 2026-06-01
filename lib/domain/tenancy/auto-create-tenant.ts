// Auto-provision a personal Tenant for a freshly-created User.
//
// Called from both signup callsites (password + OAuth) immediately after
// the User row is inserted. Without this, new users end up with no
// primaryTenantId → publishing endpoints throw `no_primary_tenant` →
// IDE breaks on first publish attempt.
//
// Tenant creation + primaryTenantId update are wrapped in $transaction
// for atomicity within this helper. The User row itself is created
// outside the transaction by the calling code; if THIS helper fails
// after user creation succeeds, an admin can re-run scripts/backfill-tenants.ts
// to repair the orphan (it's idempotent).

import { prisma } from "@/lib/database/client";
import { logger } from "@/lib/core/logger";
import type { Prisma } from "@/lib/database/generated/prisma";
import { isReservedSlug } from "./reserved-slugs";

/**
 * Derive a URL-safe slug from a username. Lowercase, alphanumeric + hyphens,
 * collapsed and trimmed, capped at 120 chars to fit the `Tenant.slug` column.
 * Falls back to "user" for usernames that collapse to empty.
 *
 * Kept consistent with scripts/backfill-tenants.ts — both signup and backfill
 * paths produce identical slugs for the same username.
 */
export function slugFromUsername(username: string): string {
  const cleaned = username
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned.slice(0, 120) || "user";
}

// Find a slug not yet taken in the Tenant table AND not on the reserved
// list. Uses the transaction client so the existence check + create
// happen in one atomic op. Reserved slugs are treated as collisions — a
// signup with username "admin" gets slug "admin-2" (or higher if also
// taken), not an error, so signup never fails on a name conflict.
async function ensureUniqueSlug(
  tx: Prisma.TransactionClient,
  baseSlug: string,
): Promise<string> {
  let candidate = baseSlug;
  let suffix = 2;
  while (
    isReservedSlug(candidate) ||
    (await tx.tenant.findUnique({
      where: { slug: candidate },
      select: { id: true },
    }))
  ) {
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export type ProvisionedTenant = {
  tenantId: string;
  slug: string;
};

/**
 * Create a personal Tenant for the given user and set their primaryTenantId.
 * Idempotent if the user already has a primary tenant — returns the existing one.
 */
export async function createPersonalTenantForUser(
  userId: string,
  username: string,
): Promise<ProvisionedTenant> {
  // Fast path: user already has a primary tenant (re-entrant safety, e.g.
  // OAuth callback firing twice for the same user).
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      primaryTenant: { select: { id: true, slug: true } },
    },
  });
  if (existing?.primaryTenant) {
    return {
      tenantId: existing.primaryTenant.id,
      slug: existing.primaryTenant.slug,
    };
  }

  const baseSlug = slugFromUsername(username);

  const provisioned = await prisma.$transaction(async (tx) => {
    const slug = await ensureUniqueSlug(tx, baseSlug);
    const tenant = await tx.tenant.create({
      data: {
        ownerId: userId,
        slug,
        displayName: username,
        isPersonal: true,
      },
      select: { id: true, slug: true },
    });
    await tx.user.update({
      where: { id: userId },
      data: { primaryTenantId: tenant.id },
    });
    return { tenantId: tenant.id, slug: tenant.slug };
  });

  logger.info({
    layer: "auth",
    event: "tenancy:personal_tenant:provisioned",
    summary: "auto-created personal tenant on signup",
    attrs: {
      user_id: userId,
      tenant_id: provisioned.tenantId,
      slug: provisioned.slug,
    },
  });

  return provisioned;
}
