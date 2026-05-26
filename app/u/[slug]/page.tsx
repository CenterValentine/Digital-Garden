/**
 * Subpath tenant home: /u/<slug>
 *
 * Renders a tenant's published content index — same shape as the
 * host-based home (`app/page.tsx`) but resolves the tenant from the
 * URL slug instead of the request host.
 *
 * This is the entry point that makes additional sites publicly
 * reachable without DNS / custom hostname setup. Once a user creates
 * a second site in Settings → Sites, anyone visiting
 * `<your-host>/u/<slug>` sees that site's content.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/database/client";
import { withPageTrace } from "@/lib/core/logger";
import { resolveTenantBySlug } from "@/lib/domain/tenancy";

interface Params {
  slug: string;
}

export const revalidate = 60;

export default async function TenantSubpathHome({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  return withPageTrace(
    { route: "/u/[slug]", attrs: { slug } },
    () => renderTenantHome(slug),
  );
}

async function renderTenantHome(slug: string) {
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) {
    notFound();
  }

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
            {tenant.displayName}
          </h1>
          <p className="text-sm text-white/30 font-mono">/u/{tenant.slug}</p>
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
                  href={`/u/${tenant.slug}/${path.slug}`}
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
                  href={`/u/${tenant.slug}/${item.path.slug}/${item.slug}`}
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
      </main>
    </div>
  );
}
