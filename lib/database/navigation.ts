// Navigation query functions for dynamic branch-based navigation
// Handles both full navigation tree and filtered views via ViewGrant

import { prisma } from "./client";
import type { UserRole } from "@/lib/infrastructure/auth/types";

export interface NavigationCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  displayOrder: number;
  branchPreset: string | null;
  isPublished: boolean;
  documents: NavigationDocument[];
  preset: string;
  hasOverflow: boolean;
  visibleCount: number;
}

export interface NavigationDocument {
  id: string;
  title: string;
  slug: string;
  docType: string;
  displayOrder: number;
  children: NavigationDocument[];
  preset?: string;
  hasOverflow?: boolean;
  visibleCount?: number;
}

export interface NavigationTree {
  categories: NavigationCategory[];
  standaloneDocuments: NavigationDocument[];
}

interface NavQueryOptions {
  userId: string;
  userRole: UserRole;
  viewKey?: string; // Optional query string filter
  includeUnpublished?: boolean; // For admin views
}

/**
 * Calculate branch preset from child count with overflow handling
 */
export function calculatePresetFromChildCount(
  count: number,
  override?: string | null
): { preset: string; hasOverflow: boolean; visibleCount: number } {
  if (override) {
    return { preset: override, hasOverflow: false, visibleCount: count };
  }

  if (count <= 1) {
    return { preset: "straight", hasOverflow: false, visibleCount: count };
  }
  if (count === 2) {
    return { preset: "binary", hasOverflow: false, visibleCount: 2 };
  }
  if (count === 3) {
    return { preset: "trident", hasOverflow: false, visibleCount: 3 };
  }
  if (count <= 5) {
    return { preset: "tridentDeep", hasOverflow: false, visibleCount: count };
  }
  if (count <= 11) {
    return { preset: "fan", hasOverflow: false, visibleCount: count };
  }

  // 12+ children: show 11 + overflow node
  return { preset: "fan", hasOverflow: true, visibleCount: 11 };
}

/**
 * Get full navigation tree (all accessible categories and documents)
 */
export async function getNavigationTree(
  options: NavQueryOptions
): Promise<NavigationTree> {
  const { userId, includeUnpublished } = options;

  const publishedFilter = includeUnpublished ? {} : { isPublished: true };

  // Get all categories for this user, ordered by displayOrder (with id as tiebreaker)
  // Handle anonymous users (guests) by not filtering by ownerId
  const categoryWhere: any = {
    ...publishedFilter,
  };
  
  // Only filter by ownerId if user is authenticated (not anonymous)
  if (userId !== "anonymous") {
    categoryWhere.ownerId = userId;
  }
  
  const categories = await prisma.category.findMany({
    where: categoryWhere,
    orderBy: [
      { displayOrder: "asc" },
      { id: "asc" }, // Tiebreaker for deterministic ordering when displayOrder conflicts
    ],
    include: {
      contentNodes: {
        where: {
          ...publishedFilter,
          deletedAt: null, // Exclude soft-deleted nodes
        },
        orderBy: [
          { displayOrder: "asc" },
          { id: "asc" }, // Tiebreaker for displayOrder conflicts
        ],
      },
    },
  });

  // Transform to navigation format with preset calculations
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const navCategories: NavigationCategory[] = categories.map(
    (category: any) => {
      const childCount = category.contentNodes?.length || 0;
      const presetData = calculatePresetFromChildCount(
        childCount,
        null // branchPreset field no longer exists
      );

      return {
        id: category.id,
        name: category.name,
        slug: category.slug,
        description: category.description,
        displayOrder: category.displayOrder,
        branchPreset: null,
        isPublished: category.isPublished,
        // Map ContentNodes to documents for backwards compatibility
        documents: (category.contentNodes || []).map((node: any) => ({
          id: node.id,
          title: node.title,
          slug: node.slug || `node-${node.id}`,
          docType: node.contentType || 'note',
          displayOrder: node.displayOrder,
          children: [], // ContentNodes use hierarchical structure via parentId
        })),
        ...presetData,
      };
    }
  );

  return {
    categories: navCategories,
    standaloneDocuments: [],
  };
}

/**
 * Get filtered navigation tree based on ViewGrant entries
 * NOTE: ViewGrant structure changed in ContentNode v2.0
 * This now returns full tree as filtering is handled at the ContentNode level
 */
export async function getFilteredNavigationTree(
  options: NavQueryOptions
): Promise<NavigationTree> {
  // ViewGrant no longer supports viewKey filtering in ContentNode v2.0
  // Return full tree instead
  return getNavigationTree(options);
}

/**
 * Main entry point - returns filtered or full navigation tree based on viewKey
 */
export async function getNavigationData(
  options: NavQueryOptions
): Promise<NavigationTree> {
  if (options.viewKey) {
    return getFilteredNavigationTree(options);
  }
  return getNavigationTree(options);
}
