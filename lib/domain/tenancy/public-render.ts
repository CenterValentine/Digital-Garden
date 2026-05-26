// Shared public-content resolvers used by BOTH the host-based public
// catch-all (`app/(public)/[...path]`) AND the subpath route
// (`app/u/[slug]/[...path]`). Same tenant-scoped queries, different
// tenant-resolution entry point.
//
// See docs/notes-feature/work-tracking/epochs/epoch-20-tenant-ux-v1.md.

import { prisma } from "@/lib/database/client";
import { withSpan } from "@/lib/core/logger/span";

/**
 * Look up a tenant by its public-facing slug. Used for the subpath URL
 * pattern (`/u/<slug>/...`) — distinct from `resolveTenantByHost` which
 * looks up via TenantHost.
 */
export async function resolveTenantBySlug(slug: string) {
  return withSpan(
    { layer: "route", name: "tenancy:tenant:lookup" },
    { attrs: { slug, source: "db_by_slug" } },
    async () => {
      const tenant = await prisma.tenant.findUnique({
        where: { slug },
        select: {
          id: true,
          ownerId: true,
          slug: true,
          displayName: true,
          isPersonal: true,
        },
      });
      return tenant
        ? {
            tenantId: tenant.id,
            ownerId: tenant.ownerId,
            slug: tenant.slug,
            displayName: tenant.displayName,
            isPersonal: tenant.isPersonal,
          }
        : null;
    },
  );
}

/**
 * Walk a public path tree to find a leaf PublicItem matching the trailing slug.
 * Tenant-scoped — paths and items must belong to the given tenantId.
 */
export async function resolvePublicItem(
  tenantId: string,
  pathSlugs: string[],
  slug: string,
) {
  // Walk the path tree to find the parent path
  let parentId: string | null = null;
  for (const pathSlug of pathSlugs) {
    const segment = await prisma.publicPath.findFirst({
      where: { tenantId, parentId, slug: pathSlug },
    });
    if (!segment) return null;
    parentId = segment.id;
  }

  // If no path slugs, use root paths (parentId = null)
  const path = parentId
    ? await prisma.publicPath.findFirst({
        where: { id: parentId },
      })
    : null;

  return prisma.publicItem.findFirst({
    where: {
      tenantId,
      slug,
      pathId: path?.id ?? { not: undefined as never },
      deletedAt: null,
    },
    include: {
      path: true,
      publishedRevision: true,
      blogPostPayload: true,
      projectPayload: true,
      profileSectionPayload: true,
      caseStudyPayload: true,
      bookmarkPayload: true,
      pagePayload: true,
      mediaItemPayload: true,
    },
  });
}

/**
 * Walk segments as a PublicPath listing (no trailing slug item).
 * Returns the path + its published items, or null if any segment doesn't exist.
 */
export async function resolvePublicPath(tenantId: string, segments: string[]) {
  let parentId: string | null = null;
  let current: Awaited<ReturnType<typeof prisma.publicPath.findFirst>> = null;

  for (const seg of segments) {
    current = await prisma.publicPath.findFirst({
      where: { tenantId, parentId, slug: seg },
    });
    if (!current) return null;
    parentId = current.id;
  }

  if (!current) return null;

  const items = await prisma.publicItem.findMany({
    where: { tenantId, pathId: current.id, state: "published", deletedAt: null },
    select: {
      id: true,
      slug: true,
      publicTitle: true,
      payloadType: true,
      publicTags: true,
      firstPublishedAt: true,
      path: { select: { slug: true, title: true } },
      blogPostPayload: { select: { excerpt: true, coverImageUrl: true } },
    },
    orderBy: { lastPublishedAt: "desc" },
    take: 50,
  });

  return { ...current, items };
}

/**
 * Build a host-style URL for a PublicItem (used by redirects, etc.)
 */
export function buildPublicItemPath(item: {
  slug: string;
  path: { slug: string };
}) {
  return `/${item.path.slug}/${item.slug}`;
}

/**
 * Build a subpath-style URL for a PublicItem (used when constructing
 * cross-tenant or non-primary-host links).
 */
export function buildSubpathItemUrl(
  tenantSlug: string,
  item: { slug: string; path: { slug: string } },
) {
  return `/u/${tenantSlug}/${item.path.slug}/${item.slug}`;
}
