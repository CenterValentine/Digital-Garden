/**
 * DefaultTenantIndex — generic landing for any tenant without a code-driven
 * personal home.
 *
 * Rendered by app/page.tsx when the resolved tenant is NOT David's personal
 * tenant (i.e. any user who claims a custom hostname or visits via subdomain).
 * Uses the tenant's displayName as the page title and lists their published
 * sections + recent items. Functionally similar to PersonalHome today, but
 * parameterized over the tenant — adding a new site means a working landing
 * page immediately, no code changes required.
 *
 * Future enhancement seam: the plan reserves Tenant.homeTemplate as a
 * nullable field so a future template-picker can branch off this component.
 * For now, every non-David tenant gets this default rendering.
 */

import Link from "next/link";
import { prisma } from "@/lib/database/client";
import type { ResolvedTenant } from "@/lib/domain/tenancy";

export async function DefaultTenantIndex({
  tenant,
}: {
  tenant: ResolvedTenant;
}) {
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
          <p className="text-lg text-white/50">
            Published notes, essays, and ideas.
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
            <p className="text-white/20 text-xs mt-2">
              The owner of this site hasn&apos;t published anything yet.
            </p>
          </div>
        )}

        <footer className="mt-24 pt-8 border-t border-white/5 flex items-center justify-between">
          <span className="text-xs text-white/15">{tenant.displayName}</span>
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
