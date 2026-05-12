/**
 * Content Tree API
 *
 * GET /api/content/content/tree - Get hierarchical content tree
 *
 * Optimized for file tree rendering with virtualization support.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";

type DebugTreeItem = {
  id: string;
  title: string;
  displayOrder: number;
};

type ContentTreeNode = {
  id: string;
  title: string;
  slug: string;
  parentId: string | null;
  peopleGroupId: string | null;
  personId: string | null;
  displayOrder: number;
  customIcon: string | null;
  iconColor: string | null;
  isPublished: boolean;
  contentType: string;
  treeNodeKind: "content" | "peopleGroup" | "person";
  role: string;
  children: ContentTreeNode[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  note?: unknown;
  folder?: {
    viewMode: string;
    sortMode: string | null;
    includeReferencedContent: boolean;
  };
  file?: {
    fileName: string;
    mimeType: string;
    fileSize: string;
    uploadStatus: string;
    thumbnailUrl: string | null;
  };
  html?: {
    isTemplate: boolean;
  };
  code?: {
    language: string;
  };
  external?: {
    url: string;
    subtype: string | null;
    readingStatus: string;
    faviconUrl: string | null;
    preserveHtml: boolean;
  };
  visualization?: {
    engine: string;
  };
  peopleMount?: {
    mountId: string;
    groupId?: string;
    personId?: string;
  };
};

// ============================================================
// GET /api/content/content/tree - Get Content Tree
// ============================================================

function collectSubtreeIds(nodeMap: Map<string, ContentTreeNode>, rootId: string): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const [id, node] of nodeMap) {
    if (node.parentId !== null) {
      const list = childrenByParent.get(node.parentId) ?? [];
      list.push(id);
      childrenByParent.set(node.parentId, list);
    }
  }
  const visited = new Set<string>();
  const queue = [rootId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const childId of childrenByParent.get(id) ?? []) {
      queue.push(childId);
    }
  }
  return visited;
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();

    const { searchParams } = new URL(request.url);
    const includeDeleted = searchParams.get("includeDeleted") === "true";
    const showReferencedContent = searchParams.get("showReferencedContent") === "true";
    const workspaceId = searchParams.get("workspaceId");
    const directViewRootContentId = searchParams.get("viewRootContentId");

    let viewRootContentId: string | null = directViewRootContentId;
    if (!viewRootContentId && workspaceId) {
      const workspace = await prisma.contentWorkspace.findFirst({
        where: { id: workspaceId, ownerId: session.user.id, status: "active" },
        select: { viewRootContentId: true },
      });
      viewRootContentId = workspace?.viewRootContentId ?? null;
    }

    // Fetch all content for user (flat list)
    // IMPORTANT: Don't apply orderBy here - we'll sort after building the tree
    const allContent = await prisma.contentNode.findMany({
      where: {
        ownerId: session.user.id,
        deletedAt: includeDeleted ? undefined : null,
        // Phase 2: Filter by role - hide referenced/system content by default
        role: showReferencedContent
          ? { in: ["primary", "referenced"] }
          : "primary",
      },
      select: {
        id: true,
        title: true,
        slug: true,
        contentType: true,
        role: true, // Phase 2: Include role for visibility indicators
        parentId: true,
        peopleGroupId: true,
        personId: true,
        displayOrder: true,
        customIcon: true,
        iconColor: true,
        isPublished: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,

        // Payload metadata (not full content)
        notePayload: {
          select: {
            metadata: true,
          },
        },
        filePayload: {
          select: {
            fileName: true,
            mimeType: true,
            fileSize: true,
            uploadStatus: true,
            thumbnailUrl: true,
          },
        },
        htmlPayload: {
          select: {
            isTemplate: true,
          },
        },
        codePayload: {
          select: {
            language: true,
          },
        },
        folderPayload: {
          select: {
            viewMode: true,
            sortMode: true,
            includeReferencedContent: true,
          },
        },
        externalPayload: {
          select: {
            url: true,
            subtype: true,
            readingStatus: true,
            faviconUrl: true,
            preserveHtml: true,
          },
        },
        visualizationPayload: {
          select: {
            engine: true,
          },
        },
      },
    });

    const peopleMounts = await prisma.peopleFileTreeMount.findMany({
      where: {
        ownerId: session.user.id,
      },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            slug: true,
            createdAt: true,
            updatedAt: true,
            deletedAt: true,
          },
        },
        person: {
          select: {
            id: true,
            displayName: true,
            slug: true,
            createdAt: true,
            updatedAt: true,
            deletedAt: true,
          },
        },
      },
    });

    const [peopleGroups, people] = await Promise.all([
      prisma.peopleGroup.findMany({
        where: {
          ownerId: session.user.id,
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
          slug: true,
          parentGroupId: true,
          displayOrder: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
        },
      }),
      prisma.person.findMany({
        where: {
          ownerId: session.user.id,
          deletedAt: null,
        },
        select: {
          id: true,
          displayName: true,
          slug: true,
          primaryGroupId: true,
          displayOrder: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
        },
      }),
    ]);

    // Debug logging: Show displayOrder values from database
    console.log('[Tree API] Raw database displayOrder values:');
    const grouped = allContent.reduce((acc, item) => {
      const key = item.parentId || 'ROOT';
      if (!acc[key]) acc[key] = [];
      acc[key].push({ id: item.id, title: item.title, displayOrder: item.displayOrder });
      return acc;
    }, {} as Record<string, DebugTreeItem[]>);

    for (const [parentId, items] of Object.entries(grouped)) {
      console.log(`  Parent ${parentId}:`);
      items.forEach(item => {
        console.log(`    - ${item.title} (order: ${item.displayOrder})`);
      });
    }

    // Build tree structure (client-side can also flatten if needed)
    const nodeMap = new Map<string, ContentTreeNode>();
    const rootNodes: ContentTreeNode[] = [];

    // First pass: Create all nodes
    for (const item of allContent) {
      const treeParentId = item.parentId
        ?? (item.personId ? `person:${item.personId}` : null)
        ?? (item.peopleGroupId ? `peopleGroup:${item.peopleGroupId}` : null);
      const node: ContentTreeNode = {
        id: item.id,
        title: item.title,
        slug: item.slug,
        parentId: treeParentId,
        peopleGroupId: item.peopleGroupId,
        personId: item.personId,
        displayOrder: item.displayOrder,
        customIcon: item.customIcon,
        iconColor: item.iconColor,
        isPublished: item.isPublished,
        contentType: item.contentType,
        treeNodeKind: "content",
        role: item.role, // Phase 2: Include role for UI indicators
        children: [],
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        deletedAt: item.deletedAt,
      };

      // Add payload summaries
      if (item.notePayload) {
        node.note = item.notePayload.metadata;
      }
      if (item.folderPayload) {
        node.folder = {
          viewMode: item.folderPayload.viewMode,
          sortMode: item.folderPayload.sortMode,
          includeReferencedContent: item.folderPayload.includeReferencedContent,
        };
      }
      if (item.filePayload) {
        node.file = {
          fileName: item.filePayload.fileName,
          mimeType: item.filePayload.mimeType,
          fileSize: item.filePayload.fileSize.toString(),
          uploadStatus: item.filePayload.uploadStatus,
          thumbnailUrl: item.filePayload.thumbnailUrl,
        };
      }
      if (item.htmlPayload) {
        node.html = {
          isTemplate: item.htmlPayload.isTemplate,
        };
      }
      if (item.codePayload) {
        node.code = {
          language: item.codePayload.language,
        };
      }
      // Phase 2: External payload
      if (item.externalPayload) {
        node.external = {
          url: item.externalPayload.url,
          subtype: item.externalPayload.subtype,
          readingStatus: item.externalPayload.readingStatus,
          faviconUrl: item.externalPayload.faviconUrl,
          preserveHtml: item.externalPayload.preserveHtml,
        };
      }
      // Visualization payload
      if (item.visualizationPayload) {
        node.visualization = {
          engine: item.visualizationPayload.engine,
        };
      }

      nodeMap.set(item.id, node);
    }

    const peopleGroupsById = new Map(peopleGroups.map((group) => [group.id, group]));
    const peopleById = new Map(people.map((person) => [person.id, person]));
    const childGroupsByParentId = new Map<string | null, typeof peopleGroups>();
    const peopleByGroupId = new Map<string, typeof people>();
    const directlyMountedGroupIds = new Set<string>();
    const directlyMountedPersonIds = new Set<string>();

    for (const mount of peopleMounts) {
      if (mount.groupId) directlyMountedGroupIds.add(mount.groupId);
      if (mount.personId) directlyMountedPersonIds.add(mount.personId);
    }

    for (const group of peopleGroups) {
      const children = childGroupsByParentId.get(group.parentGroupId) ?? [];
      children.push(group);
      childGroupsByParentId.set(group.parentGroupId, children);
    }

    for (const person of people) {
      const groupPeople = peopleByGroupId.get(person.primaryGroupId) ?? [];
      groupPeople.push(person);
      peopleByGroupId.set(person.primaryGroupId, groupPeople);
    }

    function addPeopleGroupSubtree({
      groupId,
      parentId,
      displayOrder,
      mountId,
      inheritedMountId,
    }: {
      groupId: string;
      parentId: string | null;
      displayOrder: number;
      mountId?: string;
      inheritedMountId?: string;
    }) {
      const group = peopleGroupsById.get(groupId);
      if (!group || group.deletedAt) return;

      const isDirectMount = Boolean(mountId);
      if (!isDirectMount && directlyMountedGroupIds.has(group.id)) {
        // A separately mounted descendant owns its own position in the file tree.
        return;
      }

      const virtualId = `peopleGroup:${group.id}`;
      nodeMap.set(virtualId, {
        id: virtualId,
        title: group.name,
        slug: group.slug,
        parentId,
        peopleGroupId: group.id,
        personId: null,
        displayOrder,
        customIcon: null,
        iconColor: "text-gold-primary",
        isPublished: true,
        contentType: "folder",
        treeNodeKind: "peopleGroup",
        role: "primary",
        children: [],
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
        deletedAt: null,
        folder: {
          viewMode: "list",
          sortMode: null,
          includeReferencedContent: false,
        },
        peopleMount: {
          mountId: mountId ?? inheritedMountId ?? "",
          groupId: group.id,
        },
      });

      const nextInheritedMountId = mountId ?? inheritedMountId;
      for (const person of peopleByGroupId.get(group.id) ?? []) {
        addPersonVirtualNode({
          personId: person.id,
          parentId: virtualId,
          displayOrder: person.displayOrder,
          inheritedMountId: nextInheritedMountId,
        });
      }

      for (const childGroup of childGroupsByParentId.get(group.id) ?? []) {
        addPeopleGroupSubtree({
          groupId: childGroup.id,
          parentId: virtualId,
          displayOrder: childGroup.displayOrder,
          inheritedMountId: nextInheritedMountId,
        });
      }
    }

    function addPersonVirtualNode({
      personId,
      parentId,
      displayOrder,
      mountId,
      inheritedMountId,
    }: {
      personId: string;
      parentId: string | null;
      displayOrder: number;
      mountId?: string;
      inheritedMountId?: string;
    }) {
      const person = peopleById.get(personId);
      if (!person || person.deletedAt) return;

      const isDirectMount = Boolean(mountId);
      if (!isDirectMount && directlyMountedPersonIds.has(person.id)) {
        // A separately mounted person owns its own position in the file tree.
        return;
      }

      nodeMap.set(`person:${person.id}`, {
        id: `person:${person.id}`,
        title: person.displayName,
        slug: person.slug,
        parentId,
        peopleGroupId: null,
        personId: person.id,
        displayOrder,
        customIcon: null,
        iconColor: "text-blue-500",
        isPublished: true,
        contentType: "folder",
        treeNodeKind: "person",
        role: "primary",
        children: [],
        createdAt: person.createdAt,
        updatedAt: person.updatedAt,
        deletedAt: null,
        folder: {
          viewMode: "list",
          sortMode: null,
          includeReferencedContent: false,
        },
        peopleMount: {
          mountId: mountId ?? inheritedMountId ?? "",
          personId: person.id,
        },
      });
    }

    for (const mount of peopleMounts) {
      if (mount.groupId) {
        addPeopleGroupSubtree({
          groupId: mount.groupId,
          parentId: mount.contentParentId,
          displayOrder: mount.displayOrder,
          mountId: mount.id,
        });
        continue;
      }

      if (mount.personId) {
        addPersonVirtualNode({
          personId: mount.personId,
          parentId: mount.contentParentId,
          displayOrder: mount.displayOrder,
          mountId: mount.id,
        });
      }
    }

    // View filtering: scope tree to view root subtree when workspace is a view
    if (viewRootContentId && nodeMap.has(viewRootContentId)) {
      const included = collectSubtreeIds(nodeMap, viewRootContentId);
      for (const id of [...nodeMap.keys()]) {
        if (!included.has(id)) nodeMap.delete(id);
      }
      const viewRoot = nodeMap.get(viewRootContentId);
      if (viewRoot) viewRoot.parentId = null;
    }

    // Second pass: Build hierarchy
    for (const node of nodeMap.values()) {
      if (node.parentId === null) {
        rootNodes.push(node);
      } else {
        const parent = nodeMap.get(node.parentId);
        if (parent) {
          parent.children.push(node);
        } else if (node.parentId.startsWith("person:") || node.parentId.startsWith("peopleGroup:")) {
          // People-assigned content only appears in the standard file tree when
          // its canonical person/group has been mounted into that tree.
          continue;
        } else {
          // Orphaned node (parent deleted but child not)
          rootNodes.push(node);
        }
      }
    }

    // Sort children recursively by displayOrder (WYSIWYG)
    function sortChildren(nodes: ContentTreeNode[]) {
      nodes.sort((a, b) => {
        // Primary: by displayOrder (visual order = database order)
        if (a.displayOrder !== b.displayOrder) {
          return a.displayOrder - b.displayOrder;
        }

        // Tiebreaker: alphabetically
        return a.title.localeCompare(b.title);
      });

      for (const node of nodes) {
        if (node.children.length > 0) {
          sortChildren(node.children);
        }
      }
    }

    sortChildren(rootNodes);

    // Calculate tree stats
    const stats = {
      totalNodes: nodeMap.size,
      rootNodes: rootNodes.length,
      maxDepth: calculateMaxDepth(rootNodes),
      byType: {
        folder: 0,
        note: 0,
        file: 0,
        html: 0,
        template: 0,
        code: 0,
      } as Record<string, number>,
    };

    for (const node of nodeMap.values()) {
      stats.byType[node.contentType] = (stats.byType[node.contentType] ?? 0) + 1;
    }

    return NextResponse.json({
      success: true,
      data: {
        tree: rootNodes,
        stats,
      },
    });
  } catch (error) {
    console.error("GET /api/content/content/tree error:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch content tree";
    const isAuthError = message === "Authentication required";

    return NextResponse.json(
      {
        success: false,
        error: {
          code: isAuthError ? "AUTHENTICATION_REQUIRED" : "SERVER_ERROR",
          message: isAuthError ? "Authentication required" : message,
        },
      },
      { status: isAuthError ? 401 : 500 }
    );
  }
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function calculateMaxDepth(nodes: ContentTreeNode[], currentDepth = 0): number {
  if (nodes.length === 0) return currentDepth;

  let maxDepth = currentDepth;

  for (const node of nodes) {
    if (node.children && node.children.length > 0) {
      const childDepth = calculateMaxDepth(node.children, currentDepth + 1);
      maxDepth = Math.max(maxDepth, childDepth);
    }
  }

  return maxDepth;
}
