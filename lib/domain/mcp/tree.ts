import "server-only";

/**
 * A depth-limited listing for `garden_list_tree` and folder reads.
 *
 * The app's tree route loads every node and builds the whole tree in
 * memory, with no depth parameter; an agent wants one level at a time.
 * No service exists for that, so this is the one place MCP reads
 * `ContentNode` directly for structure (the plan's "never Prisma where a
 * service exists" rule, applied honestly).
 */

import { prisma } from "@/lib/database/client";
import type { McpScope } from "./jurisdiction";

export interface TreeEntry {
  id: string;
  title: string;
  type: string;
  parentId: string | null;
  depth: number;
  childCount: number;
  updatedAt: string;
}

export async function listTree(
  scope: McpScope,
  rootId: string | null,
  depth: number
): Promise<{ roots: TreeEntry[]; entries: TreeEntry[] } | { refusal: string }> {
  const allowed = await scope.subtreeIds();
  let frontier: string[];
  if (rootId) {
    if (!(await scope.nodeInScope(rootId))) {
      return { refusal: "That folder is outside this token's reach." };
    }
    frontier = [rootId];
  } else if (scope.wholeGarden) {
    frontier = []; // top level: parentId null
  } else {
    frontier = [...scope.rootIds];
  }

  const entries: TreeEntry[] = [];
  const roots: TreeEntry[] = [];

  // Describe the frontier itself (roots) so the agent sees where it stands.
  if (frontier.length > 0) {
    const rows = await prisma.contentNode.findMany({
      where: { id: { in: frontier }, ownerId: scope.userId, deletedAt: null },
      select: { id: true, title: true, contentType: true, parentId: true, updatedAt: true, _count: { select: { children: true } } },
    });
    for (const r of rows) {
      roots.push({
        id: r.id,
        title: r.title,
        type: r.contentType,
        parentId: r.parentId,
        depth: 0,
        childCount: r._count.children,
        updatedAt: r.updatedAt.toISOString(),
      });
    }
  }

  let parents: Array<string | null> = frontier.length > 0 ? frontier : [null];
  for (let level = 1; level <= depth && parents.length > 0; level += 1) {
    const rows = await prisma.contentNode.findMany({
      where: {
        ownerId: scope.userId,
        deletedAt: null,
        role: { in: ["primary", "referenced"] },
        ...(parents.length === 1 && parents[0] === null
          ? { parentId: null }
          : { parentId: { in: parents.filter((p): p is string => p !== null) } }),
      },
      select: { id: true, title: true, contentType: true, parentId: true, updatedAt: true, _count: { select: { children: true } } },
      orderBy: [{ displayOrder: "asc" }, { title: "asc" }],
      take: 500,
    });
    const next: string[] = [];
    for (const r of rows) {
      if (allowed && !allowed.has(r.id)) continue;
      entries.push({
        id: r.id,
        title: r.title,
        type: r.contentType,
        parentId: r.parentId,
        depth: level,
        childCount: r._count.children,
        updatedAt: r.updatedAt.toISOString(),
      });
      if (r.contentType === "folder") next.push(r.id);
    }
    parents = next;
  }
  return { roots, entries };
}

export function renderTree(roots: TreeEntry[], entries: TreeEntry[]): string {
  const lines: string[] = [];
  for (const r of roots) lines.push(`${r.type === "folder" ? "📁" : "•"} ${r.title} (${r.type}, ${r.id})`);
  for (const e of entries) {
    const pad = "  ".repeat(e.depth);
    const kids = e.type === "folder" && e.childCount > 0 ? ` · ${e.childCount} item${e.childCount === 1 ? "" : "s"}` : "";
    lines.push(`${pad}${e.type === "folder" ? "📁" : "•"} ${e.title} (${e.type}, ${e.id})${kids}`);
  }
  return lines.length > 0 ? lines.join("\n") : "Nothing here.";
}
