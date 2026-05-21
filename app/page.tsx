import Link from "next/link";
import { prisma } from "@/lib/database/client";
import { getCurrentTenant } from "@/lib/domain/tenancy";

export const revalidate = 60;

export default async function Home() {
  // Tenant resolution path:
  //   1. MULTITENANT_ENABLED=true + proxy injected x-tenant-id  → header path
  //   2. Flag off OR no header                                  → legacy
  //      fallback via SITE_OWNER_ID's primaryTenantId
  //   3. Neither resolves                                       → unconfigured
  const ctx = await getCurrentTenant();
  if (!ctx) {
    return <UnconfiguredLanding />;
  }
  const { tenant } = ctx;

  const [paths, recentItems] = await Promise.all([
    prisma.publicPath.findMany({
      where: { tenantId: tenant.tenantId, parentId: null },
      include: {
        _count: {
          select: {
            items: { where: { state: "published", deletedAt: null } },
          },
        },
      },
      orderBy: { title: "asc" },
    }),
    prisma.publicItem.findMany({
      where: { tenantId: tenant.tenantId, state: "published", deletedAt: null },
      select: {
        id: true,
        slug: true,
        publicTitle: true,
        payloadType: true,
        firstPublishedAt: true,
        lastPublishedAt: true,
        path: { select: { slug: true, title: true } },
        blogPostPayload: { select: { excerpt: true } },
      },
      orderBy: { lastPublishedAt: "desc" },
      take: 10,
    }),
  ]);

  return (
    <div className="public-route min-h-screen bg-[#0a0a0a] text-white">
      <main className="max-w-3xl mx-auto px-6 py-20">
        <header className="mb-16">
          <h1 className="text-4xl font-bold tracking-tight mb-3">
            Digital Garden
          </h1>
          <p className="text-lg text-white/50">
            A personal knowledge space for notes, ideas, and connected thinking.
          </p>
        </header>

        {paths.length > 0 && (
          <section className="mb-16">
            <h2 className="text-xs uppercase tracking-wider text-white/30 mb-6">
              Sections
            </h2>
            <div className="space-y-3">
              {paths.map((path) => (
                <Link
                  key={path.id}
                  href={`/${path.slug}`}
                  className="group flex items-center justify-between rounded-xl border border-white/8 bg-white/3 px-5 py-4 hover:border-white/15 hover:bg-white/5 transition-colors"
                >
                  <div>
                    <div className="text-base font-medium">{path.title}</div>
                    {path.description && (
                      <div className="text-sm text-white/40 mt-0.5">
                        {path.description}
                      </div>
                    )}
                  </div>
                  <span className="text-sm text-white/20 group-hover:text-white/40 transition-colors tabular-nums">
                    {path._count.items}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {recentItems.length > 0 && (
          <section>
            <h2 className="text-xs uppercase tracking-wider text-white/30 mb-6">
              Recent
            </h2>
            <div className="space-y-3">
              {recentItems.map((item) => (
                <Link
                  key={item.id}
                  href={`/${item.path.slug}/${item.slug}`}
                  className="group flex flex-col gap-1 rounded-xl border border-white/8 bg-white/3 px-5 py-4 hover:border-white/15 hover:bg-white/5 transition-colors"
                >
                  <div className="text-sm font-medium">
                    {item.publicTitle ?? item.slug}
                  </div>
                  {item.blogPostPayload?.excerpt && (
                    <div className="text-xs text-white/40 line-clamp-1">
                      {item.blogPostPayload.excerpt}
                    </div>
                  )}
                  <div className="text-xs text-white/25 mt-0.5">
                    {item.path.title}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {paths.length === 0 && recentItems.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-white/30 text-sm">Nothing published yet.</p>
          </div>
        )}

        <footer className="mt-24 pt-8 border-t border-white/5 flex items-center justify-between">
          <span className="text-xs text-white/15">Digital Garden</span>
          <Link
            href="/sign-in"
            className="text-xs text-white/15 hover:text-white/30 transition-colors"
          >
            Sign in
          </Link>
        </footer>
      </main>
    </div>
  );
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
