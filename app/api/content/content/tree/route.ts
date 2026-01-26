/**
 * Content Tree API
 *
 * GET /api/content/content/tree - Get hierarchical content tree
 *
 * Optimized for file tree rendering with virtualization support.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/middleware";
import { deriveContentType } from "@/lib/content";

// ============================================================
// GET /api/content/content/tree - Get Content Tree
// ============================================================

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();

    const { searchParams } = new URL(request.url);
    const includeDeleted = searchParams.get("includeDeleted") === "true";
    const maxDepth = Number.parseInt(searchParams.get("maxDepth") || "10");

    // Fetch all content for user (flat list)
    // IMPORTANT: Don't apply orderBy here - we'll sort after building the tree
    const allContent = await prisma.contentNode.findMany({
      where: {
        ownerId: session.user.id,
        deletedAt: includeDeleted ? undefined : null,
      },
      select: {
        id: true,
        title: true,
        slug: true,
        parentId: true,
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
      },
    });

    // Debug logging: Show displayOrder values from database
    console.log('[Tree API] Raw database displayOrder values:');
    const grouped = allContent.reduce((acc, item) => {
      const key = item.parentId || 'ROOT';
      if (!acc[key]) acc[key] = [];
      acc[key].push({ id: item.id, title: item.title, displayOrder: item.displayOrder });
      return acc;
    }, {} as Record<string, any[]>);

    for (const [parentId, items] of Object.entries(grouped)) {
      console.log(`  Parent ${parentId}:`);
      items.forEach(item => {
        console.log(`    - ${item.title} (order: ${item.displayOrder})`);
      });
    }

    // Build tree structure (client-side can also flatten if needed)
    const nodeMap = new Map<string, any>();
    const rootNodes: any[] = [];

    // First pass: Create all nodes
    for (const item of allContent) {
      const contentType = deriveContentType(item as any);

      const node: any = {
        id: item.id,
        title: item.title,
        slug: item.slug,
        parentId: item.parentId,
        displayOrder: item.displayOrder,
        customIcon: item.customIcon,
        iconColor: item.iconColor,
        isPublished: item.isPublished,
        contentType,
        children: [],
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        deletedAt: item.deletedAt,
      };

      // Add payload summaries
      if (item.notePayload) {
        node.note = item.notePayload.metadata;
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

      nodeMap.set(item.id, node);
    }

    // Second pass: Build hierarchy
    for (const node of nodeMap.values()) {
      if (node.parentId === null) {
        rootNodes.push(node);
      } else {
        const parent = nodeMap.get(node.parentId);
        if (parent) {
          parent.children.push(node);
        } else {
          // Orphaned node (parent deleted but child not)
          rootNodes.push(node);
        }
      }
    }

    // Sort children recursively by displayOrder (WYSIWYG)
    function sortChildren(nodes: any[]) {
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
      totalNodes: allContent.length,
      rootNodes: rootNodes.length,
      maxDepth: calculateMaxDepth(rootNodes),
      byType: {
        folder: 0,
        note: 0,
        file: 0,
        html: 0,
        template: 0,
        code: 0,
      },
    };

    for (const node of nodeMap.values()) {
      stats.byType[node.contentType as keyof typeof stats.byType]++;
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
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: "Failed to fetch content tree",
        },
      },
      { status: 500 }
    );
  }
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function calculateMaxDepth(nodes: any[], currentDepth = 0): number {
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

