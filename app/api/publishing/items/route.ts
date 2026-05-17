/**
 * GET  /api/publishing/items?contentNodeId=...  — PublicItems linked to a ContentNode
 * POST /api/publishing/items                     — create a new PublicItem (add to publishing)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { prisma } from "@/lib/database/client";

export async function GET(req: NextRequest) {
  const session = await requireAuth();
  

  const { searchParams } = new URL(req.url);
  const contentNodeId = searchParams.get("contentNodeId");

  if (!contentNodeId) {
    return NextResponse.json({ error: "contentNodeId required" }, { status: 400 });
  }

  const items = await prisma.publicItem.findMany({
    where: {
      ownerId: session.user.id,
      contentNodeId,
      deletedAt: null,
    },
    include: {
      path: { select: { id: true, slug: true, title: true } },
      workingRevision: { select: { id: true, bodyHash: true, metadataHash: true } },
      publishedRevision: { select: { id: true, bodyHash: true, metadataHash: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const result = items.map((item) => ({
    id: item.id,
    contentNodeId: item.contentNodeId,
    pathId: item.pathId,
    slug: item.slug,
    payloadType: item.payloadType,
    publicTitle: item.publicTitle,
    state: item.state,
    validationStatus: item.validationStatus,
    validationIssues: item.validationIssues,
    firstPublishedAt: item.firstPublishedAt?.toISOString() ?? null,
    lastPublishedAt: item.lastPublishedAt?.toISOString() ?? null,
    scheduledFor: item.scheduledFor?.toISOString() ?? null,
    workingRevisionId: item.workingRevisionId,
    publishedRevisionId: item.publishedRevisionId,
    hasPendingChanges:
      item.workingRevision !== null &&
      item.publishedRevision !== null &&
      item.workingRevision.bodyHash !== item.publishedRevision.bodyHash,
    path: item.path,
  }));

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const session = await requireAuth();
  

  const body = await req.json();
  const { contentNodeId, pathId, slug, payloadType, publicTitle } = body as {
    contentNodeId: string;
    pathId: string;
    slug: string;
    payloadType: string;
    publicTitle?: string;
  };

  if (!contentNodeId || !pathId || !slug || !payloadType) {
    return NextResponse.json(
      { error: "contentNodeId, pathId, slug, payloadType required" },
      { status: 400 }
    );
  }

  // Verify the ContentNode belongs to this user
  const node = await prisma.contentNode.findFirst({
    where: { id: contentNodeId, ownerId: session.user.id },
  });
  if (!node) {
    return NextResponse.json({ error: "ContentNode not found" }, { status: 404 });
  }

  const item = await prisma.publicItem.create({
    data: {
      ownerId: session.user.id,
      contentNodeId,
      pathId,
      slug,
      payloadType: payloadType as never,
      publicTitle: publicTitle ?? null,
      state: "draft",
    },
  });

  // Create the type-specific payload record (all fields have defaults or are optional)
  try {
    switch (payloadType) {
      case "blog_post":
        await prisma.blogPostPayload.create({ data: { publicItemId: item.id } });
        break;
      case "page":
        await prisma.pagePayload.create({ data: { publicItemId: item.id } });
        break;
      case "project":
        await prisma.projectPayload.create({ data: { publicItemId: item.id } });
        break;
      case "profile_section":
        await prisma.profileSectionPayload.create({ data: { publicItemId: item.id } });
        break;
      case "case_study":
        await prisma.caseStudyPayload.create({ data: { publicItemId: item.id } });
        break;
      case "media_item":
        await prisma.mediaItemPayload.create({ data: { publicItemId: item.id } });
        break;
      // bookmark requires a URL; caller must PATCH to add it
    }
  } catch {
    // Non-fatal: payload creation failure doesn't block the item from being created
  }

  return NextResponse.json(item, { status: 201 });
}
