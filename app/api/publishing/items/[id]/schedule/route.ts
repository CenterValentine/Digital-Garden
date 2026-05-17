/**
 * POST /api/publishing/items/[id]/schedule
 * Body: { scheduledFor: ISO string }
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
  const body = await req.json();
  const { scheduledFor } = body as { scheduledFor: string };

  if (!scheduledFor) {
    return NextResponse.json({ error: "scheduledFor required" }, { status: 400 });
  }

  const date = new Date(scheduledFor);
  if (isNaN(date.getTime()) || date <= new Date()) {
    return NextResponse.json(
      { error: "scheduledFor must be a future date" },
      { status: 400 }
    );
  }

  const item = await prisma.publicItem.findFirst({
    where: { id, ownerId: session.user.id, deletedAt: null },
  });

  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (item.state === "archived") {
    return NextResponse.json({ error: "Cannot schedule an archived item" }, { status: 422 });
  }

  await prisma.publicItem.update({
    where: { id },
    data: { state: "scheduled", scheduledFor: date },
  });

  return NextResponse.json({ ok: true, scheduledFor: date.toISOString() });
}
