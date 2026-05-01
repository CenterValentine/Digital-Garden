import { notFound, permanentRedirect } from "next/navigation";
import { prisma } from "@/lib/database/client";

// Single site owner — resolved at build/runtime from env.
// In a multi-tenant future this comes from the request host.
const SITE_OWNER_ID = process.env.SITE_OWNER_ID ?? "";

interface Params {
  path?: string[];
}

export default async function PublicCatchAll({
  params,
}: {
  params: Promise<Params>;
}) {
  const { path: segments = [] } = await params;
  const fullPath = "/" + segments.join("/");

  if (!SITE_OWNER_ID) {
    // Not configured — show nothing publicly
    notFound();
  }

  // 1. Check redirects first
  const redirect = await prisma.publicPathRedirect.findUnique({
    where: { fromPath: fullPath },
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
      SITE_OWNER_ID,
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
  const publicPath = await resolvePublicPath(SITE_OWNER_ID, segments);
  if (publicPath) {
    const { PublicPathListing } = await import(
      "../../../components/public/renderers/PublicPathListing"
    );
    return <PublicPathListing publicPath={publicPath} />;
  }

  notFound();
}

async function resolvePublicItem(
  ownerId: string,
  pathSlugs: string[],
  slug: string
) {
  // Walk the path tree to find the parent path
  let parentId: string | null = null;
  for (const pathSlug of pathSlugs) {
    const segment = await prisma.publicPath.findFirst({
      where: { ownerId, parentId, slug: pathSlug },
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
      ownerId,
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

async function resolvePublicPath(ownerId: string, segments: string[]) {
  let parentId: string | null = null;
  let current = null;

  for (const seg of segments) {
    current = await prisma.publicPath.findFirst({
      where: { ownerId, parentId, slug: seg },
    });
    if (!current) return null;
    parentId = current.id;
  }

  return current;
}

function buildPublicItemPath(item: { slug: string; path: { slug: string } }) {
  return `/${item.path.slug}/${item.slug}`;
}

export const revalidate = 60; // ISR: revalidate every minute
