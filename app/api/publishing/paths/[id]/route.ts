/**
 * PATCH  /api/publishing/paths/[id]  — update title, slug, description, icon
 * DELETE /api/publishing/paths/[id]  — delete (rejects if path has items or children)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { prisma } from "@/lib/database/client";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await requireAuth();
  const { id } = await params;

  const path = await prisma.publicPath.findUnique({ where: { id } });
  if (!path || path.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json() as {
    title?: string;
    slug?: string;
    description?: string | null;
    icon?: string | null;
  };

  const updated = await prisma.publicPath.update({
    where: { id },
    data: {
      ...(body.title !== undefined && { title: body.title }),
      ...(body.slug !== undefined && { slug: body.slug }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.icon !== undefined && { icon: body.icon }),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await requireAuth();
  const { id } = await params;

  const path = await prisma.publicPath.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          children: true,
          items: { where: { deletedAt: null } },
        },
      },
    },
  });

  if (!path || path.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (path._count.children > 0) {
    return NextResponse.json(
      { error: `Cannot delete: this path has ${path._count.children} child path${path._count.children === 1 ? "" : "s"}. Delete them first.` },
      { status: 409 }
    );
  }
  if (path._count.items > 0) {
    return NextResponse.json(
      { error: `Cannot delete: this path contains ${path._count.items} published item${path._count.items === 1 ? "" : "s"}. Remove them first.` },
      { status: 409 }
    );
  }

  await prisma.publicPath.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
