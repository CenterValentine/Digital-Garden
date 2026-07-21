import { notFound, permanentRedirect, redirect as nextRedirect } from "next/navigation";
import { prisma } from "@/lib/database/client";
import { withPageTrace } from "@/lib/core/logger";
import { getCurrentSession } from "@/lib/infrastructure/auth";
import {
  getCurrentTenant,
  resolvePublicItem,
  resolvePublicPath,
  buildPublicItemPath,
} from "@/lib/domain/tenancy";

interface Params {
  path: string[];
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function PublicCatchAll({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: SearchParams;
}) {
  const { path: segments } = await params;
  const fullPath = "/" + segments.join("/");
  // Composer draft preview. Reading searchParams makes preview requests
  // dynamic (bypassing the 60s ISR) — published traffic without the param
  // keeps the cached path.
  const wantsDraft = (await searchParams).preview === "draft";

  return withPageTrace(
    { route: "/(public)/[...path]", attrs: { path: fullPath } },
    () => renderPublic(fullPath, segments, wantsDraft),
  );
}

async function renderPublic(
  fullPath: string,
  segments: string[],
  wantsDraft: boolean,
) {
  // Tenant resolution: header (multi-tenant) → SITE_OWNER_ID fallback
  // (legacy single-tenant). When neither resolves the public surface
  // is unconfigured for this host → show nothing.
  const ctx = await getCurrentTenant();
  if (!ctx) {
    notFound();
  }
  const { tenant } = ctx;

  // 0. Personal-site code-driven pages (davidvalentine.org only). These take
  //    precedence over any DB-published path of the same slug — they are
  //    hand-authored React surfaces, not publishing content. Mirrors the
  //    `tenant.isPersonal && slug === "david"` gate in app/page.tsx.
  if (tenant.isPersonal && tenant.slug === "david") {
    const joined = segments.join("/");

    // Draft preview is owner-only: same-host iframe/tab shares the session
    // cookie, so a plain session check suffices. Non-owners silently get the
    // published view rather than an error.
    let draft = false;
    if (wantsDraft) {
      const session = await getCurrentSession();
      draft = session?.user.id === tenant.ownerId;
    }

    if (joined === "about") {
      const { AboutPage } = await import(
        "../../../components/personal/AboutPage"
      );
      return <AboutPage />;
    }
    if (joined === "results") {
      const [{ WorkResultsPage }, { fetchWorkData }] = await Promise.all([
        import("../../../components/personal/WorkResultsPage"),
        import("@/lib/domain/page-layout/resolve"),
      ]);
      const data = await fetchWorkData(tenant.tenantId, { draft });
      return <WorkResultsPage data={data ?? undefined} />;
    }
    if (joined === "resume") {
      const { ResumePage } = await import(
        "../../../components/personal/ResumePage"
      );
      return <ResumePage />;
    }
    if (joined === "garden") {
      const { GardenConstructionPage } = await import(
        "../../../components/personal/GardenConstructionPage"
      );
      return <GardenConstructionPage />;
    }
    if (joined === "hobby") {
      const { HobbyPage } = await import(
        "../../../components/personal/HobbyPage"
      );
      return <HobbyPage />;
    }
    if (joined === "blog") {
      const [{ FieldNotesPage }, { fetchGardenData }] = await Promise.all([
        import("../../../components/personal/FieldNotesPage"),
        import("@/lib/domain/page-layout/resolve"),
      ]);
      const cats = await fetchGardenData(tenant.tenantId, { draft });
      return <FieldNotesPage cats={cats ?? undefined} />;
    }
  }

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

  // 4. Personal tenant: unbuilt routes gracefully redirect to the garden
  //    home instead of 404ing. Real published paths are resolved above (steps
  //    2–3); this only catches slugs with no content yet (e.g. /contact,
  //    /writing) so they don't dead-end while those pages are in progress.
  if (tenant.isPersonal) {
    nextRedirect("/");
  }

  notFound();
}

// Resolvers are shared with the subpath route — see lib/domain/tenancy/public-render.ts.

export const revalidate = 60; // ISR: revalidate every minute
