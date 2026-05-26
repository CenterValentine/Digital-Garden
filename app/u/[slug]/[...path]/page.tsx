/**
 * Subpath tenant content: /u/<slug>/<...path>
 *
 * Mirrors `app/(public)/[...path]/page.tsx` but resolves the tenant
 * from the URL slug rather than the request host. Shares the
 * resolvers in lib/domain/tenancy/public-render.ts so render
 * semantics stay identical between the two route surfaces.
 *
 * Difference from the host-based catch-all:
 *   - Tenant comes from URL `slug` not Host header
 *   - Redirects within this tenant rewrite to /u/<slug>/<target>
 *     (preserves the subpath prefix)
 */

import { notFound, permanentRedirect } from "next/navigation";
import { prisma } from "@/lib/database/client";
import { withPageTrace } from "@/lib/core/logger";
import {
  resolveTenantBySlug,
  resolvePublicItem,
  resolvePublicPath,
} from "@/lib/domain/tenancy";

interface Params {
  slug: string;
  path: string[];
}

export const revalidate = 60;

export default async function TenantSubpathCatchAll({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug, path: segments } = await params;
  const fullPath = "/" + segments.join("/");
  return withPageTrace(
    {
      route: "/u/[slug]/[...path]",
      attrs: { slug, path: fullPath },
    },
    () => renderSubpathContent(slug, fullPath, segments),
  );
}

async function renderSubpathContent(
  slug: string,
  fullPath: string,
  segments: string[],
) {
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) {
    notFound();
  }

  const subpathPrefix = `/u/${tenant.slug}`;

  // 1. Check redirects, tenant-scoped.
  const redirect = await prisma.publicPathRedirect.findFirst({
    where: { tenantId: tenant.tenantId, fromPath: fullPath },
    include: {
      toPath: true,
      toPublicItem: { include: { path: true } },
    },
  });

  if (redirect?.isActive) {
    if (redirect.expiresAt && redirect.expiresAt < new Date()) {
      // Redirect expired — fall through to normal resolution
    } else if (redirect.toPublicItem) {
      const item = redirect.toPublicItem;
      permanentRedirect(`${subpathPrefix}/${item.path.slug}/${item.slug}`);
    } else if (redirect.toPath) {
      permanentRedirect(`${subpathPrefix}/${redirect.toPath.slug}`);
    }
  }

  // 2. Try to resolve as a PublicItem (path + slug)
  if (segments.length >= 1) {
    const itemSlug = segments[segments.length - 1];
    const pathSlugs = segments.slice(0, -1);

    const publicItem = await resolvePublicItem(
      tenant.tenantId,
      pathSlugs,
      itemSlug,
    );

    if (publicItem) {
      if (publicItem.state !== "published") notFound();

      const { PublicItemRenderer } = await import(
        "../../../../components/public/renderers/PublicItemRenderer"
      );
      return <PublicItemRenderer item={publicItem} />;
    }
  }

  // 3. Try to resolve as a PublicPath listing
  const publicPath = await resolvePublicPath(tenant.tenantId, segments);
  if (publicPath) {
    const { PublicPathListing } = await import(
      "../../../../components/public/renderers/PublicPathListing"
    );
    return <PublicPathListing publicPath={publicPath} />;
  }

  notFound();
}
