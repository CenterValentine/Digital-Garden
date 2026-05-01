/**
 * POST /api/publishing/items/[id]/sync
 * Creates or updates the working revision from the ContentNode's current content.
 * Returns hasPendingChanges so the sidebar can show "Changes pending" immediately.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { prisma } from "@/lib/database/client";
import crypto from "crypto";

function hashJson(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 64);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth();
  const { id } = await params;

  const item = await prisma.publicItem.findFirst({
    where: { id, ownerId: session.user.id, deletedAt: null },
    include: {
      workingRevision: true,
      publishedRevision: { select: { bodyHash: true } },
      contentNode: { include: { notePayload: true } },
    },
  });

  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const liveBodyJson = item.contentNode.notePayload?.tiptapJson ?? { type: "doc", content: [] };
  const liveBodyHash = hashJson(liveBodyJson);
  const metadataSnapshot = { publicTitle: item.publicTitle, publicTags: item.publicTags };
  const metadataHash = hashJson(metadataSnapshot);

  // Upsert the working revision
  let workingRevision = item.workingRevision;
  if (!workingRevision) {
    workingRevision = await prisma.publicItemRevision.create({
      data: {
        publicItemId: id,
        bodyJson: liveBodyJson,
        metadataSnapshot,
        bodyHash: liveBodyHash,
        metadataHash,
        authorId: session.user.id,
      },
    });
    await prisma.publicItem.update({
      where: { id },
      data: { workingRevisionId: workingRevision.id },
    });
  } else if (workingRevision.bodyHash !== liveBodyHash) {
    // Update existing working revision's body
    workingRevision = await prisma.publicItemRevision.update({
      where: { id: workingRevision.id },
      data: {
        bodyJson: liveBodyJson,
        bodyHash: liveBodyHash,
        metadataSnapshot,
        metadataHash,
      },
    });
  }

  const hasPendingChanges =
    item.publishedRevision !== null &&
    workingRevision.bodyHash !== item.publishedRevision.bodyHash;

  return NextResponse.json({ ok: true, hasPendingChanges, bodyHash: workingRevision.bodyHash });
}
