/**
 * GET  /api/publishing/paths  — list PublicPath tree for the authenticated owner
 * POST /api/publishing/paths  — create a new PublicPath
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { prisma } from "@/lib/database/client";

export async function GET() {
  const session = await requireAuth();
  

  const paths = await prisma.publicPath.findMany({
    where: { ownerId: session.user.id },
    orderBy: [{ parentId: "asc" }, { displayOrder: "asc" }],
    include: {
      _count: { select: { items: { where: { deletedAt: null } } } },
    },
  });

  // Build tree client-side via parentId references
  interface PathNode {
    id: string;
    parentId: string | null;
    slug: string;
    title: string;
    description: string | null;
    displayOrder: number;
    icon: string | null;
    children: PathNode[];
    itemCount: number;
  }

  const nodeMap = new Map<string, PathNode>();
  const roots: PathNode[] = [];

  for (const p of paths) {
    const node: PathNode = {
      id: p.id,
      parentId: p.parentId,
      slug: p.slug,
      title: p.title,
      description: p.description,
      displayOrder: p.displayOrder,
      icon: p.icon,
      children: [],
      itemCount: p._count.items,
    };
    nodeMap.set(p.id, node);
  }

  for (const node of nodeMap.values()) {
    if (node.parentId && nodeMap.has(node.parentId)) {
      nodeMap.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return NextResponse.json(roots);
}

export async function POST(req: NextRequest) {
  const session = await requireAuth();
  

  const body = await req.json();
  const { slug, title, parentId, description, icon } = body as {
    slug: string;
    title: string;
    parentId?: string;
    description?: string;
    icon?: string;
  };

  if (!slug || !title) {
    return NextResponse.json({ error: "slug and title required" }, { status: 400 });
  }

  const path = await prisma.publicPath.create({
    data: {
      ownerId: session.user.id,
      slug,
      title,
      parentId: parentId ?? null,
      description: description ?? null,
      icon: icon ?? null,
    },
  });

  return NextResponse.json(path, { status: 201 });
}
