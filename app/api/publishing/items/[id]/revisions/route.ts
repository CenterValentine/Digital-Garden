/**
 * GET /api/publishing/items/[id]/revisions — list all revisions for an item, newest first
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

  // Verify ownership
  const item = await prisma.publicItem.findFirst({
    where: { id, ownerId: session.user.id, deletedAt: null },
    select: {
      id: true,
      workingRevisionId: true,
      publishedRevisionId: true,
    },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const revisions = await prisma.publicItemRevision.findMany({
    where: { publicItemId: id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      publishedAt: true,
      bodyHash: true,
      ogTitle: true,
      note: true,
      wordCount: true,
      readingTimeMinutes: true,
    },
  });

  return NextResponse.json({
    revisions: revisions.map((r) => ({
      ...r,
      isWorking: r.id === item.workingRevisionId,
      isPublished: r.id === item.publishedRevisionId,
    })),
  });
}
