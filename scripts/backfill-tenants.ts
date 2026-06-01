/**
 * Backfill tenant rows for the multi-tenancy foundation (Epoch 18 / Phase 1).
 *
 * What this script does (idempotent):
 *   1. For every existing User that owns any PublicItem or PublicPath,
 *      create one Tenant row (isPersonal=true, slug derived from username).
 *   2. Set User.primaryTenantId = that tenant's id.
 *   3. For the SITE_OWNER_ID user specifically, create a TenantHost row
 *      mapping `davidvalentine.org` (and `www.davidvalentine.org`) to the
 *      personal tenant, isPrimary=true on the bare host.
 *   4. Populate PublicItem.tenantId, PublicPath.tenantId,
 *      PublicPathRedirect.tenantId from each row's owner's primary tenant.
 *   5. Print a verification summary and exit 1 if any tenantId remains null.
 *
 * Safe to re-run: every step is "create if missing" / "update if null."
 *
 * Usage: npx tsx scripts/backfill-tenants.ts
 *
 * Pre-flight:
 *   - .env.local points at the intended branch (dev for dev, prod for prod)
 *   - prisma db push has been run so the new schema is live on that branch
 */

// Load env BEFORE importing the prisma client. The Prisma client in
// lib/database/client.ts reads process.env.DATABASE_URL at module-load
// time — if dotenv hasn't run yet, it falls back to the dummy URL and
// you get ECONNREFUSED against localhost:5432. The side-effect import
// below must stay first so ESM evaluates it before client.js.
import "./_load-env.js";
import { prisma } from "../lib/database/client.js";
import { slugFromUsername } from "../lib/domain/tenancy/auto-create-tenant.js";

const SITE_OWNER_ID = process.env.SITE_OWNER_ID ?? "";
const DAVID_HOSTS = ["davidvalentine.org", "www.davidvalentine.org"] as const;

type RunStats = {
  tenantsCreated: number;
  primaryTenantsSet: number;
  hostsCreated: number;
  publicItemsBackfilled: number;
  publicPathsBackfilled: number;
  publicPathRedirectsBackfilled: number;
};

// slugFromUsername is imported from lib/domain/tenancy/auto-create-tenant.ts
// (single source of truth — signup auto-tenant uses the same function).

async function ensureUniqueSlug(baseSlug: string): Promise<string> {
  // If the base slug is taken, append a numeric suffix until we find one
  // that isn't. Avoids the rare collision in dev/test fixtures.
  let candidate = baseSlug;
  let suffix = 2;
  while (
    await prisma.tenant.findUnique({
      where: { slug: candidate },
      select: { id: true },
    })
  ) {
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

async function main(): Promise<void> {
  const stats: RunStats = {
    tenantsCreated: 0,
    primaryTenantsSet: 0,
    hostsCreated: 0,
    publicItemsBackfilled: 0,
    publicPathsBackfilled: 0,
    publicPathRedirectsBackfilled: 0,
  };

  console.log("🔍 Finding users with publishing data…");

  // Find every user who currently owns any PublicItem or PublicPath.
  // These are the only users who need tenants right now — others can
  // self-serve via the Phase 6c Settings UI when it ships.
  const usersWithPublishingData = await prisma.user.findMany({
    where: {
      OR: [{ publicPaths: { some: {} } }, { publicItems: { some: {} } }],
    },
    select: {
      id: true,
      username: true,
      email: true,
      primaryTenantId: true,
      ownedTenants: { select: { id: true, slug: true, isPersonal: true } },
    },
  });

  console.log(`📊 Found ${usersWithPublishingData.length} user(s) with publishing data`);

  for (const user of usersWithPublishingData) {
    // Pick a personal tenant if one already exists, else create one.
    let personalTenantId: string | undefined = user.ownedTenants.find(
      (t) => t.isPersonal,
    )?.id;

    if (!personalTenantId) {
      const desiredSlug = user.id === SITE_OWNER_ID
        ? "david"
        : slugFromUsername(user.username);
      const slug = await ensureUniqueSlug(desiredSlug);

      const created = await prisma.tenant.create({
        data: {
          ownerId: user.id,
          slug,
          displayName: user.username,
          isPersonal: true,
        },
        select: { id: true },
      });
      personalTenantId = created.id;
      stats.tenantsCreated += 1;
      console.log(`  ✓ Created Tenant ${slug} for user ${user.username}`);
    }

    // Set this as the user's primary if they don't have one set.
    if (!user.primaryTenantId) {
      await prisma.user.update({
        where: { id: user.id },
        data: { primaryTenantId: personalTenantId },
      });
      stats.primaryTenantsSet += 1;
    }

    // For David specifically, add the davidvalentine.org host mappings.
    if (user.id === SITE_OWNER_ID) {
      for (const host of DAVID_HOSTS) {
        const exists = await prisma.tenantHost.findUnique({
          where: { host },
          select: { tenantId: true },
        });
        if (!exists) {
          await prisma.tenantHost.create({
            data: {
              host,
              tenantId: personalTenantId,
              isPrimary: host === "davidvalentine.org",
            },
          });
          stats.hostsCreated += 1;
          console.log(`  ✓ Created TenantHost ${host} → david`);
        }
      }
    }
  }

  // Backfill tenantId on existing publishing rows.
  console.log("📦 Backfilling PublicItem.tenantId…");
  const publicItemsWithoutTenant = await prisma.publicItem.findMany({
    where: { tenantId: null },
    select: { id: true, ownerId: true },
  });

  for (const item of publicItemsWithoutTenant) {
    const owner = await prisma.user.findUnique({
      where: { id: item.ownerId },
      select: { primaryTenantId: true },
    });
    if (!owner?.primaryTenantId) {
      console.error(
        `  ✗ PublicItem ${item.id} owner ${item.ownerId} has no primaryTenantId — skipping`,
      );
      continue;
    }
    await prisma.publicItem.update({
      where: { id: item.id },
      data: { tenantId: owner.primaryTenantId },
    });
    stats.publicItemsBackfilled += 1;
  }

  console.log("📦 Backfilling PublicPath.tenantId…");
  const publicPathsWithoutTenant = await prisma.publicPath.findMany({
    where: { tenantId: null },
    select: { id: true, ownerId: true },
  });

  for (const path of publicPathsWithoutTenant) {
    const owner = await prisma.user.findUnique({
      where: { id: path.ownerId },
      select: { primaryTenantId: true },
    });
    if (!owner?.primaryTenantId) {
      console.error(
        `  ✗ PublicPath ${path.id} owner ${path.ownerId} has no primaryTenantId — skipping`,
      );
      continue;
    }
    await prisma.publicPath.update({
      where: { id: path.id },
      data: { tenantId: owner.primaryTenantId },
    });
    stats.publicPathsBackfilled += 1;
  }

  console.log("📦 Backfilling PublicPathRedirect.tenantId…");
  const redirectsWithoutTenant = await prisma.publicPathRedirect.findMany({
    where: { tenantId: null },
    select: { id: true, ownerId: true },
  });

  for (const redirect of redirectsWithoutTenant) {
    const owner = await prisma.user.findUnique({
      where: { id: redirect.ownerId },
      select: { primaryTenantId: true },
    });
    if (!owner?.primaryTenantId) {
      console.error(
        `  ✗ PublicPathRedirect ${redirect.id} owner ${redirect.ownerId} has no primaryTenantId — skipping`,
      );
      continue;
    }
    await prisma.publicPathRedirect.update({
      where: { id: redirect.id },
      data: { tenantId: owner.primaryTenantId },
    });
    stats.publicPathRedirectsBackfilled += 1;
  }

  // Verification.
  console.log("");
  console.log("🔎 Verification:");
  const stillNullItems = await prisma.publicItem.count({ where: { tenantId: null } });
  const stillNullPaths = await prisma.publicPath.count({ where: { tenantId: null } });
  const stillNullRedirects = await prisma.publicPathRedirect.count({
    where: { tenantId: null },
  });
  const usersWithoutPrimary = await prisma.user.count({
    where: {
      AND: [
        { primaryTenantId: null },
        {
          OR: [
            { publicPaths: { some: {} } },
            { publicItems: { some: {} } },
          ],
        },
      ],
    },
  });

  console.log(`  Tenants created:                 ${stats.tenantsCreated}`);
  console.log(`  Users gained primaryTenantId:    ${stats.primaryTenantsSet}`);
  console.log(`  TenantHost rows created:         ${stats.hostsCreated}`);
  console.log(`  PublicItem rows backfilled:      ${stats.publicItemsBackfilled}`);
  console.log(`  PublicPath rows backfilled:      ${stats.publicPathsBackfilled}`);
  console.log(`  PublicPathRedirect backfilled:   ${stats.publicPathRedirectsBackfilled}`);
  console.log("");
  console.log(`  Remaining PublicItem.tenantId null:           ${stillNullItems}`);
  console.log(`  Remaining PublicPath.tenantId null:           ${stillNullPaths}`);
  console.log(`  Remaining PublicPathRedirect.tenantId null:   ${stillNullRedirects}`);
  console.log(
    `  Publishing users still missing primaryTenantId: ${usersWithoutPrimary}`,
  );

  if (
    stillNullItems > 0 ||
    stillNullPaths > 0 ||
    stillNullRedirects > 0 ||
    usersWithoutPrimary > 0
  ) {
    console.error("❌ Backfill did not reach a clean state — inspect rows above.");
    process.exit(1);
  }

  console.log("✅ Backfill complete and clean.");
}

main()
  .catch((err) => {
    console.error("❌ Backfill failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
