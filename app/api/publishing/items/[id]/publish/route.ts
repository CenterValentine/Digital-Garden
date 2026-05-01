/**
 * POST /api/publishing/items/[id]/publish
 * Snapshots the working revision → published revision, sets state = published.
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
  const body = await req.json().catch(() => ({}));
  const { note } = body as { note?: string };

  const item = await prisma.publicItem.findFirst({
    where: { id, ownerId: session.user.id, deletedAt: null },
    include: { workingRevision: true },
  });

  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (item.validationStatus === "blocked") {
    return NextResponse.json(
      { error: "Validation errors must be resolved before publishing" },
      { status: 422 }
    );
  }
  if (item.state === "archived") {
    return NextResponse.json(
      { error: "Cannot publish an archived item" },
      { status: 422 }
    );
  }

  // Use working revision body or empty doc
  const bodyJson = item.workingRevision?.bodyJson ?? { type: "doc", content: [] };
  const metadataSnapshot = { publicTitle: item.publicTitle, publicTags: item.publicTags };
  const now = new Date();

  const revision = await prisma.publicItemRevision.create({
    data: {
      publicItemId: id,
      bodyJson,
      metadataSnapshot,
      bodyHash: hashJson(bodyJson),
      metadataHash: hashJson(metadataSnapshot),
      note: note ?? null,
      publishedAt: now,
      authorId: session.user.id,
    },
  });

  await prisma.publicItem.update({
    where: { id },
    data: {
      state: "published",
      publishedRevisionId: revision.id,
      lastPublishedAt: now,
      firstPublishedAt: item.firstPublishedAt ?? now,
      scheduledFor: null,
    },
  });

  return NextResponse.json({ ok: true, revisionId: revision.id });
}
