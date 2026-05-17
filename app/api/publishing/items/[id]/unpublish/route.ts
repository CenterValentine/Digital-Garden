/**
 * POST /api/publishing/items/[id]/unpublish
 * Transitions state: published → unpublished. Content stays; just goes dark.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { prisma } from "@/lib/database/client";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth();
  

  const { id } = await params;

  const item = await prisma.publicItem.findFirst({
    where: { id, ownerId: session.user.id, deletedAt: null },
  });

  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (item.state !== "published") {
    return NextResponse.json(
      { error: "Item is not currently published" },
      { status: 422 }
    );
  }

  await prisma.publicItem.update({
    where: { id },
    data: { state: "unpublished" },
  });

  return NextResponse.json({ ok: true });
}
