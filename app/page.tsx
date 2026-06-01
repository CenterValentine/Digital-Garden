/**
 * Home dispatcher.
 *
 * Routes `/` to one of three components based on the request host:
 *
 *   1. host = PLATFORM_DOMAIN (e.g. notetrellis.com)
 *      → <PlatformHome />   — platform marketing landing, no tenant lookup
 *   2. tenant.slug = "david" && tenant.isPersonal
 *      → <PersonalHome />   — David's code-driven personal home
 *   3. otherwise
 *      → <DefaultTenantIndex /> — generic landing for any other tenant
 *
 * The dispatcher itself does NO data fetching — each home component fetches
 * its own slice. This keeps the dispatcher trivial and lets each surface
 * evolve independently. PlatformHome never opens a Prisma client; the
 * other two share an identical-shape query that the React server runtime
 * dedupes per request.
 *
 * Why dispatch on host BEFORE tenant lookup: the platform domain
 * (notetrellis.com) won't have a TenantHost row — it's not a tenant, it's
 * the platform's own marketing surface. Special-casing it here avoids a
 * useless DB lookup and a confusing "unconfigured" fallback.
 */

import { headers } from "next/headers";
import Link from "next/link";
import { getCurrentTenant, normalizeHost } from "@/lib/domain/tenancy";
import { PlatformHome } from "@/components/home/PlatformHome";
import { PersonalHome } from "@/components/home/PersonalHome";
import { DefaultTenantIndex } from "@/components/home/DefaultTenantIndex";

export const revalidate = 60;

const PERSONAL_HOME_SLUG = "david";

export default async function Home() {
  const platformDomain = process.env.PLATFORM_DOMAIN?.trim().toLowerCase();
  const host = normalizeHost((await headers()).get("host"));

  // Branch 1: platform marketing surface. Short-circuit before any DB work.
  if (platformDomain && host === platformDomain) {
    return <PlatformHome />;
  }

  const ctx = await getCurrentTenant();
  if (!ctx) {
    return <UnconfiguredLanding />;
  }

  const { tenant } = ctx;

  // Branch 2: David's hand-crafted personal home. Exact slug match keeps
  // this seam narrow — other tenants don't accidentally inherit it.
  if (tenant.isPersonal && tenant.slug === PERSONAL_HOME_SLUG) {
    return <PersonalHome tenant={tenant} />;
  }

  // Branch 3: generic per-tenant landing.
  return <DefaultTenantIndex tenant={tenant} />;
}

function UnconfiguredLanding() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-8 text-center">
      <h1 className="text-4xl font-bold tracking-tight text-foreground">
        Digital Garden
      </h1>
      <p className="max-w-md text-base text-gray-600 dark:text-gray-400">
        A personal knowledge space for notes, ideas, and connected thinking.
      </p>
      <div className="flex gap-3">
        <Link
          href="/sign-in"
          className="rounded-lg bg-gold-primary/15 dark:bg-gold-primary/20 px-5 py-2.5 text-sm font-medium text-gold-dark dark:text-gold-primary transition-colors hover:bg-gold-primary/25 dark:hover:bg-gold-primary/30"
        >
          Sign in
        </Link>
        <Link
          href="/sign-up"
          className="rounded-lg border border-black/10 dark:border-white/10 px-5 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors hover:bg-black/[0.03] dark:hover:bg-white/5"
        >
          Create account
        </Link>
      </div>
    </main>
  );
}
