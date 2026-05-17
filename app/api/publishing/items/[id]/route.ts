/**
 * GET   /api/publishing/items/[id]  — fetch a single PublicItem with all payloads
 * PATCH /api/publishing/items/[id]  — update publicTitle, publicTags, slug, pathId
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { prisma } from "@/lib/database/client";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth();
  const { id } = await params;

  const item = await prisma.publicItem.findFirst({
    where: { id, ownerId: session.user.id, deletedAt: null },
    include: {
      path: true,
      series: true,
      workingRevision: true,
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

  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    ...item,
    hasPendingChanges:
      item.workingRevision !== null &&
      item.publishedRevision !== null &&
      item.workingRevision.bodyHash !== item.publishedRevision.bodyHash,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth();
  const { id } = await params;

  const item = await prisma.publicItem.findFirst({
    where: { id, ownerId: session.user.id, deletedAt: null },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const { publicTitle, publicTags, slug, pathId, seriesId, seriesOrder } = body as {
    publicTitle?: string;
    publicTags?: string[];
    slug?: string;
    pathId?: string;
    seriesId?: string | null;
    seriesOrder?: number | null;
  };

  // Validate slug uniqueness if changing slug or path
  if (slug !== undefined || pathId !== undefined) {
    const targetSlug = slug ?? item.slug;
    const targetPathId = pathId ?? item.pathId;
    const conflict = await prisma.publicItem.findFirst({
      where: {
        pathId: targetPathId,
        slug: targetSlug,
        id: { not: id },
        deletedAt: null,
      },
    });
    if (conflict) {
      return NextResponse.json(
        { error: "Slug already used in this path" },
        { status: 409 }
      );
    }
  }

  const updated = await prisma.publicItem.update({
    where: { id },
    data: {
      ...(publicTitle !== undefined && { publicTitle }),
      ...(publicTags !== undefined && { publicTags }),
      ...(slug !== undefined && { slug }),
      ...(pathId !== undefined && { pathId }),
      ...(seriesId !== undefined && { seriesId }),
      ...(seriesOrder !== undefined && { seriesOrder }),
      // Reset validation when metadata changes
      validationStatus: "unchecked",
    },
  });

  return NextResponse.json(updated);
}
