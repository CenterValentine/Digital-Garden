import { notFound, permanentRedirect } from "next/navigation";
import { prisma } from "@/lib/database/client";
import { withPageTrace } from "@/lib/core/logger";
import { getCurrentTenant } from "@/lib/domain/tenancy";

interface Params {
  path: string[];
}

export default async function PublicCatchAll({
  params,
}: {
  params: Promise<Params>;
}) {
  const { path: segments } = await params;
  const fullPath = "/" + segments.join("/");

  return withPageTrace(
    { route: "/(public)/[...path]", attrs: { path: fullPath } },
    () => renderPublic(fullPath, segments),
  );
}

async function renderPublic(fullPath: string, segments: string[]) {
  // Tenant resolution: header (multi-tenant) → SITE_OWNER_ID fallback
  // (legacy single-tenant). When neither resolves the public surface
  // is unconfigured for this host → show nothing.
  const ctx = await getCurrentTenant();
  if (!ctx) {
    notFound();
  }
  const { tenant } = ctx;

  // 1. Check redirects first. Redirects are tenant-scoped so two
  //    tenants could legitimately use the same /old-url. Using
  //    findFirst with a tenantId filter; the standalone fromPath
  //    unique constraint becomes [tenantId, fromPath] in a follow-up.
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
      const targetPath = buildPublicItemPath(item);
      permanentRedirect(targetPath);
    } else if (redirect.toPath) {
      permanentRedirect("/" + redirect.toPath.slug);
    }
  }

  // 2. Try to resolve as a PublicItem (path + slug)
  if (segments.length >= 1) {
    const slug = segments[segments.length - 1];
    const pathSlugs = segments.slice(0, -1);

    // Find matching path + item
    const publicItem = await resolvePublicItem(
      tenant.tenantId,
      pathSlugs,
      slug
    );

    if (publicItem) {
      if (publicItem.state !== "published") notFound();

      const { PublicItemRenderer } = await import(
        "../../../components/public/renderers/PublicItemRenderer"
      );
      return <PublicItemRenderer item={publicItem} />;
    }
  }

  // 3. Try to resolve as a PublicPath listing
  const publicPath = await resolvePublicPath(tenant.tenantId, segments);
  if (publicPath) {
    const { PublicPathListing } = await import(
      "../../../components/public/renderers/PublicPathListing"
    );
    return <PublicPathListing publicPath={publicPath} />;
  }

  notFound();
}

async function resolvePublicItem(
  tenantId: string,
  pathSlugs: string[],
  slug: string
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

async function resolvePublicPath(tenantId: string, segments: string[]) {
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

function buildPublicItemPath(item: { slug: string; path: { slug: string } }) {
  return `/${item.path.slug}/${item.slug}`;
}

export const revalidate = 60; // ISR: revalidate every minute
