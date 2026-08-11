/**
 * PersonalHome — davidvalentine.org's hand-crafted home (server component).
 *
 * Rendered by app/page.tsx when the resolved tenant is David's personal tenant
 * (slug = "david", isPersonal = true). Thin data-fetch boundary: it joins the
 * generic publishing records (`PublicPath` / `PublicItem`) to the garden's
 * visual vocabulary via [lib/personal/buildCats.ts], producing the `CATS`
 * object the client garden engines consume. All animation/scroll logic lives in
 * [components/home/PersonalHomeShell.tsx] (the "use client" island).
 *
 * Paths with no published items fall back to designed placeholder content, so
 * the garden looks intentional from day one. See [lib/personal/gardenConfig.ts].
 *
 * PersonalHomeShell is loaded via next/dynamic rather than a static import.
 * app/page.tsx's dispatcher reaches this module from every `/` request
 * regardless of which branch renders at runtime — a static import here would
 * put PersonalHomeShell's CSS (components/home/m44-home.css) in the route's
 * bundle unconditionally. dynamic() keeps that chunk request-scoped to
 * requests that actually render this branch.
 */

import { prisma } from "@/lib/database/client";
import dynamic from "next/dynamic";
import type { ResolvedTenant } from "@/lib/domain/tenancy";
import { buildCats } from "@/lib/personal/buildCats";

const PersonalHomeShell = dynamic(() =>
  import("./PersonalHomeShell").then((m) => m.PersonalHomeShell)
);

export async function PersonalHome({ tenant }: { tenant: ResolvedTenant }) {
  const paths = await prisma.publicPath.findMany({
    where: { tenantId: tenant.tenantId, parentId: null },
    select: {
      slug: true,
      title: true,
      items: {
        where: { state: "published", deletedAt: null },
        select: {
          publicTitle: true,
          blogPostPayload: { select: { excerpt: true } },
        },
        orderBy: { lastPublishedAt: "desc" },
      },
    },
    orderBy: { title: "asc" },
  });

  const cats = buildCats(paths);

  return <PersonalHomeShell cats={cats} />;
}
