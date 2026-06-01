/**
 * PersonalHome — davidvalentine.org's hand-crafted home.
 *
 * Rendered by app/page.tsx when the resolved tenant is David's personal
 * tenant (slug = "david", isPersonal = true). Preserves the exact existing
 * visual identity of davidvalentine.org from before the multi-tenancy split
 * — no user should notice a visual change when this dispatcher landed.
 *
 * This is the "code-driven home" seam: future personal homepage tweaks
 * (sections, custom blocks, intro essay) belong here, NOT in
 * DefaultTenantIndex. The components are intentionally separate files so
 * David's home can diverge from the generic tenant landing without coupling.
 */

import Link from "next/link";
import { prisma } from "@/lib/database/client";
import type { ResolvedTenant } from "@/lib/domain/tenancy";

export async function PersonalHome({ tenant }: { tenant: ResolvedTenant }) {
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
